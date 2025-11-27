
import React, { useEffect, useRef, useState } from 'react';
import { TripPoint, TransportType, TripData, BgmType } from '../types';
import { db, auth, storage } from '../firebase';
import { collection, addDoc, doc, updateDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { Plus, Trash2, Image as ImageIcon, Loader2, Save, ArrowLeft, Pencil, X, MapPin, AlertCircle, Music, Youtube, FileAudio, ChevronDown, ChevronUp } from 'lucide-react';

interface TripEditorProps {
  onFinish: () => void;
  initialData?: TripData | null;
}

// Robust sort helper
const robustSort = (a: TripPoint, b: TripPoint) => {
    const timeA = new Date(a.date).getTime();
    const timeB = new Date(b.date).getTime();
    
    // 1. Timestamp compare
    if (!isNaN(timeA) && !isNaN(timeB)) {
        if (timeA !== timeB) return timeA - timeB;
    }
    
    // 2. String compare
    const strComp = a.date.localeCompare(b.date);
    if (strComp !== 0) return strComp;
    
    // 3. Fallback to ID
    return a.id.localeCompare(b.id);
};

const TripEditor: React.FC<TripEditorProps> = ({ onFinish, initialData }) => {
  const mapRef = useRef<HTMLDivElement>(null);
  const [map, setMap] = useState<any>(null);
  const [marker, setMarker] = useState<any>(null);
  
  // Trip State
  const [points, setPoints] = useState<TripPoint[]>([]);
  const [tripTitle, setTripTitle] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isUploadingPoint, setIsUploadingPoint] = useState(false);

  // BGM State
  const [bgmType, setBgmType] = useState<BgmType>('NONE');
  const [bgmUrl, setBgmUrl] = useState('');
  const [bgmFile, setBgmFile] = useState<File | null>(null);
  const [isBgmPanelOpen, setIsBgmPanelOpen] = useState(false);
  const [isUploadingBgm, setIsUploadingBgm] = useState(false);

  // Edit Point State
  const [editingPointId, setEditingPointId] = useState<string | null>(null);

  // Form State
  const [currentLat, setCurrentLat] = useState<number>(37.566826);
  const [currentLng, setCurrentLng] = useState<number>(126.9786567);
  const [locationName, setLocationName] = useState('');
  const [address, setAddress] = useState('');
  const [date, setDate] = useState('');
  const [transport, setTransport] = useState<TransportType>('CAR');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  
  // Photo State
  const [photoUrl, setPhotoUrl] = useState('');
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string>('');

  // Initialize Data for Edit Mode
  useEffect(() => {
    if (initialData) {
      setTripTitle(initialData.title);
      // Sort points strictly by date
      const sortedPoints = [...initialData.points].sort(robustSort);
      setPoints(sortedPoints);

      if (initialData.bgmType && initialData.bgmType !== 'NONE') {
          setBgmType(initialData.bgmType);
          setBgmUrl(initialData.bgmUrl || '');
          setIsBgmPanelOpen(true);
      }
    }
  }, [initialData]);

  // Initialize Map with ResizeObserver for robustness
  useEffect(() => {
    if (!mapRef.current) return;

    const startLat = initialData && initialData.points.length > 0 ? initialData.points[0].lat : 37.566826;
    const startLng = initialData && initialData.points.length > 0 ? initialData.points[0].lng : 126.9786567;

    const options = {
      center: new window.kakao.maps.LatLng(startLat, startLng),
      level: 3,
    };
    const newMap = new window.kakao.maps.Map(mapRef.current, options);
    setMap(newMap);

    const newMarker = new window.kakao.maps.Marker({
      position: newMap.getCenter(),
    });
    newMarker.setMap(newMap);
    setMarker(newMarker);

    // --- GEOLOCATION LOGIC START ---
    // If it's a new trip (no initial data), try to get user's current location
    if (!initialData && navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
            (position) => {
                const lat = position.coords.latitude;
                const lng = position.coords.longitude;
                const loc = new window.kakao.maps.LatLng(lat, lng);
                
                newMap.setCenter(loc);
                newMarker.setPosition(loc);
                
                setCurrentLat(lat);
                setCurrentLng(lng);
                
                // Optional: Try to get address for current location
                const geocoder = new window.kakao.maps.services.Geocoder();
                geocoder.coord2Address(lng, lat, (result: any, status: any) => {
                    if (status === window.kakao.maps.services.Status.OK) {
                        setAddress(result[0].address.address_name);
                    }
                });
            },
            (error) => {
                console.warn("Geolocation failed or denied:", error);
            }
        );
    }
    // --- GEOLOCATION LOGIC END ---

    // FIX: Resize Observer to handle container size changes
    const resizeObserver = new ResizeObserver(() => {
        newMap.relayout();
        newMap.setCenter(newMap.getCenter());
    });
    resizeObserver.observe(mapRef.current);

    // Initial relayout to ensure full rendering
    setTimeout(() => newMap.relayout(), 500);

    window.kakao.maps.event.addListener(newMap, 'click', (mouseEvent: any) => {
      const latlng = mouseEvent.latLng;
      newMarker.setPosition(latlng);
      setCurrentLat(latlng.getLat());
      setCurrentLng(latlng.getLng());
      
      const geocoder = new window.kakao.maps.services.Geocoder();
      geocoder.coord2Address(latlng.getLng(), latlng.getLat(), (result: any, status: any) => {
        if (status === window.kakao.maps.services.Status.OK) {
          setAddress(result[0].address.address_name);
        }
      });
    });

    updatePolyline(newMap, points);

    return () => {
        resizeObserver.disconnect();
    };
  }, [initialData]); 

  // Update Polyline
  useEffect(() => {
    if (map) {
        updatePolyline(map, points);
    }
  }, [points, map]);

  const updatePolyline = (targetMap: any, tripPoints: TripPoint[]) => {
      if (tripPoints.length < 2) return;
      // Sort before drawing
      const sorted = [...tripPoints].sort(robustSort);
      const linePath = sorted.map(p => new window.kakao.maps.LatLng(p.lat, p.lng));
      
      const polyline = new window.kakao.maps.Polyline({
        path: linePath,
        strokeWeight: 5,
        strokeColor: '#4F46E5',
        strokeOpacity: 0.8,
        strokeStyle: 'solid'
      });
      // Note: In a production app, we should clear previous polylines properly
      polyline.setMap(targetMap);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setPhotoFile(file);
      setPreviewUrl(URL.createObjectURL(file));
      setPhotoUrl(''); 
    }
  };

  const handleBgmFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files[0]) {
          setBgmFile(e.target.files[0]);
          setBgmUrl(''); // Clear URL if file selected
      }
  };

  // Helper to extract YouTube ID
  const extractYoutubeId = (url: string) => {
    // If it's already an ID (11 chars, alphanumeric + _ -)
    const idRegex = /^[a-zA-Z0-9_-]{11}$/;
    if (idRegex.test(url)) return url;

    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
    const match = url.match(regExp);
    return (match && match[2].length === 11) ? match[2] : null;
  };

  const clearForm = () => {
    setTitle('');
    setDescription('');
    setLocationName('');
    setAddress('');
    setDate(''); 
    setPhotoUrl('');
    setPhotoFile(null);
    setPreviewUrl('');
    setEditingPointId(null);
  };

  const handleEditPoint = (point: TripPoint) => {
    setEditingPointId(point.id);
    setCurrentLat(point.lat);
    setCurrentLng(point.lng);
    setLocationName(point.locationName);
    setAddress(point.address);
    setDate(point.date);
    setTransport(point.transportToNext);
    setTitle(point.title);
    setDescription(point.description);
    setPhotoUrl(point.photoUrl);
    setPreviewUrl(point.photoUrl); 
    setPhotoFile(null); 

    if (map && marker) {
        const pos = new window.kakao.maps.LatLng(point.lat, point.lng);
        map.panTo(pos);
        marker.setPosition(pos);
    }
  };

  const handleAddOrUpdatePoint = async () => {
    if (!title || !date) {
      alert('제목과 날짜는 필수입니다.');
      return;
    }

    setIsUploadingPoint(true);
    let finalPhotoUrl = photoUrl;

    try {
      // 1. Handle File Upload
      if (photoFile) {
        const userId = auth.currentUser?.uid || 'anonymous';
        const randomStr = Math.random().toString(36).substring(7);
        const fileName = `${Date.now()}_${randomStr}`;
        const storageRef = ref(storage, `trip_images/${userId}/${fileName}`);
        
        try {
            const snapshot = await uploadBytes(storageRef, photoFile);
            finalPhotoUrl = await getDownloadURL(snapshot.ref);
        } catch (uploadError: any) {
            console.error("Firebase Storage Upload Error:", uploadError);
            console.warn("TIP: Go to Firebase Console > Storage > Rules and change to 'allow read, write: if true;' for development.");
            
            // Fallback for unauthorized/permission errors
            const keywords = ['travel', 'nature', 'road', 'city', 'food'];
            const randomKeyword = keywords[Math.floor(Math.random() * keywords.length)];
            finalPhotoUrl = `https://source.unsplash.com/800x600/?${randomKeyword}&sig=${Math.random()}`;
            alert(`사진 업로드 권한이 없어 기본 여행 이미지로 대체합니다.\n(Firebase Storage Rules 설정을 확인해주세요)`);
        }
      } 
      // 2. Use Fallback if empty
      else if (!finalPhotoUrl) {
        const keywords = ['travel', 'landscape', 'view'];
        const randomKeyword = keywords[Math.floor(Math.random() * keywords.length)];
        finalPhotoUrl = `https://source.unsplash.com/800x600/?${randomKeyword}&sig=${Math.random()}`;
      }

      const pointData = {
        lat: currentLat,
        lng: currentLng,
        locationName: locationName || address || '알 수 없는 장소',
        address,
        date,
        transportToNext: transport,
        title,
        description,
        photoUrl: finalPhotoUrl,
      };

      let updatedPoints: TripPoint[] = [];

      if (editingPointId) {
        updatedPoints = points.map(p => p.id === editingPointId ? { ...p, ...pointData } : p);
      } else {
        const newPoint: TripPoint = {
            id: Date.now().toString(),
            order: 0, // Placeholder
            ...pointData
        };
        updatedPoints = [...points, newPoint];
      }

      // CRITICAL: Robust Sort chronologically by date
      updatedPoints.sort(robustSort);
      
      // Reassign order
      updatedPoints = updatedPoints.map((p, idx) => ({ ...p, order: idx }));

      setPoints(updatedPoints);
      clearForm();

    } catch (error) {
      console.error("Error processing point:", error);
      alert("지점 저장 중 오류가 발생했습니다.");
    } finally {
      setIsUploadingPoint(false);
    }
  };

  const handleSaveTrip = async () => {
    if (!auth.currentUser) {
        alert("로그인이 세션이 만료되었습니다. 다시 로그인해주세요.");
        return;
    }
    if (!tripTitle) return alert('여행 제목을 입력해주세요.');
    if (points.length < 2) return alert('최소 2개 이상의 지점을 등록해주세요.');
    
    setIsSaving(true);
    let finalBgmUrl = bgmUrl;

    try {
      // Upload BGM File if exists
      if (bgmType === 'FILE' && bgmFile) {
          setIsUploadingBgm(true);
          const userId = auth.currentUser.uid;
          const storageRef = ref(storage, `trip_bgm/${userId}/${Date.now()}_${bgmFile.name}`);
          const snapshot = await uploadBytes(storageRef, bgmFile);
          finalBgmUrl = await getDownloadURL(snapshot.ref);
      } else if (bgmType === 'YOUTUBE' && bgmUrl) {
          const videoId = extractYoutubeId(bgmUrl);
          if (videoId) {
              finalBgmUrl = videoId;
          } else {
              alert("유효하지 않은 YouTube URL (또는 ID) 입니다.");
              setIsSaving(false);
              return;
          }
      }

      // FORCE FINAL SORT before saving to DB
      const finalPoints = [...points].sort(robustSort).map((p, idx) => ({ ...p, order: idx }));

      const tripData = {
        userId: auth.currentUser.uid,
        title: tripTitle,
        points: finalPoints,
        bgmType,
        bgmUrl: finalBgmUrl,
        createdAt: initialData ? initialData.createdAt : Date.now(),
      };

      if (initialData && initialData.id) {
        const tripRef = doc(db, 'trips', initialData.id);
        await updateDoc(tripRef, tripData);
        alert('여행이 성공적으로 수정되었습니다!');
      } else {
        await addDoc(collection(db, 'trips'), tripData);
        alert('여행이 성공적으로 저장되었습니다!');
      }
      onFinish();
    } catch (e) {
      console.error(e);
      alert('저장 중 오류가 발생했습니다. (Firestore Rules를 확인해주세요)');
    } finally {
      setIsSaving(false);
      setIsUploadingBgm(false);
    }
  };

  return (
    <div className="flex flex-col h-screen md:flex-row bg-gray-50">
      {/* Sidebar - Fixed Layout */}
      <div className="w-full md:w-[420px] bg-white shadow-xl z-20 flex flex-col h-full border-r border-gray-200">
        
        {/* 1. Header Area (Fixed) */}
        <div className="p-5 border-b bg-white z-10 space-y-3">
            <div className="flex items-center">
                <button onClick={onFinish} className="mr-3 p-2 hover:bg-gray-100 rounded-full transition">
                    <ArrowLeft size={20} className="text-gray-600"/>
                </button>
                <h2 className="text-xl font-bold text-indigo-800">
                    {initialData ? '여행 수정하기' : '새 여행 만들기'}
                </h2>
            </div>
            <div>
                <input 
                    type="text" 
                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 text-lg font-bold"
                    placeholder="여행 제목 (예: 부산 식도락 여행)"
                    value={tripTitle}
                    onChange={(e) => setTripTitle(e.target.value)}
                />
            </div>

            {/* BGM Configuration Toggle */}
            <div className="border rounded-lg bg-gray-50 overflow-hidden">
                <button 
                    onClick={() => setIsBgmPanelOpen(!isBgmPanelOpen)}
                    className="w-full p-3 flex justify-between items-center text-sm font-bold text-gray-700 hover:bg-gray-100 transition"
                >
                    <span className="flex items-center gap-2">
                        <Music size={16} className="text-indigo-600"/>
                        {bgmType !== 'NONE' ? '배경음악 설정됨' : '배경음악 설정 (선택)'}
                    </span>
                    {isBgmPanelOpen ? <ChevronUp size={16}/> : <ChevronDown size={16}/>}
                </button>
                
                {isBgmPanelOpen && (
                    <div className="p-3 border-t bg-white space-y-3 animate-fade-in">
                        <div className="flex gap-2">
                            <button 
                                onClick={() => setBgmType('YOUTUBE')}
                                className={`flex-1 py-2 text-xs font-bold rounded-md border flex items-center justify-center gap-1 ${bgmType === 'YOUTUBE' ? 'bg-red-50 border-red-200 text-red-600' : 'hover:bg-gray-50'}`}
                            >
                                <Youtube size={14}/> 유튜브
                            </button>
                            <button 
                                onClick={() => setBgmType('FILE')}
                                className={`flex-1 py-2 text-xs font-bold rounded-md border flex items-center justify-center gap-1 ${bgmType === 'FILE' ? 'bg-indigo-50 border-indigo-200 text-indigo-600' : 'hover:bg-gray-50'}`}
                            >
                                <FileAudio size={14}/> 파일 업로드
                            </button>
                            <button 
                                onClick={() => { setBgmType('NONE'); setBgmUrl(''); setBgmFile(null); }}
                                className={`px-3 py-2 text-xs font-bold rounded-md border hover:bg-gray-50 ${bgmType === 'NONE' ? 'bg-gray-200 text-gray-700' : 'text-gray-500'}`}
                            >
                                없음
                            </button>
                        </div>

                        {bgmType === 'YOUTUBE' && (
                            <div>
                                <input 
                                    type="text" 
                                    className="w-full p-2 border rounded text-xs"
                                    placeholder="유튜브 영상 주소 (또는 ID) 입력"
                                    value={bgmUrl}
                                    onChange={(e) => setBgmUrl(e.target.value)}
                                />
                                <p className="text-[10px] text-gray-400 mt-1">* ID(예: dQw4w9WgXcQ) 또는 전체 URL 입력 가능</p>
                            </div>
                        )}

                        {bgmType === 'FILE' && (
                            <div>
                                <input 
                                    type="file" 
                                    className="w-full text-xs"
                                    accept="audio/*"
                                    onChange={handleBgmFileChange}
                                />
                                {bgmUrl && !bgmFile && <p className="text-[10px] text-green-600 mt-1">✓ 기존 파일이 저장되어 있습니다.</p>}
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>

        {/* 2. Registered List Area (Fixed Height, Scrollable) */}
        <div className="bg-gray-50 border-b flex-shrink-0">
             <div className="px-5 py-3 flex justify-between items-center bg-gray-100/50">
                <h4 className="font-bold text-gray-600 text-sm flex items-center">
                    <MapPin size={14} className="mr-1"/> 등록된 경로 ({points.length})
                    <span className="text-[10px] text-gray-400 font-normal ml-2">(시간순 자동정렬됨)</span>
                </h4>
                <span className="text-xs text-indigo-500 font-medium bg-indigo-50 px-2 py-0.5 rounded">수정하려면 클릭</span>
             </div>
             
             <div className="max-h-[220px] overflow-y-auto p-4 space-y-2 custom-scrollbar">
                {points.length === 0 && (
                    <div className="text-center py-6 border-2 border-dashed border-gray-300 rounded-lg bg-white">
                        <MapPin className="mx-auto text-gray-300 mb-2" />
                        <p className="text-xs text-gray-400">지도에서 위치를 선택하고<br/>아래 폼을 작성하여 추가해주세요.</p>
                    </div>
                )}
                {points.map((p, idx) => (
                    <div 
                        key={p.id} 
                        onClick={() => handleEditPoint(p)}
                        className={`p-3 bg-white border rounded-lg shadow-sm flex gap-3 hover:shadow-md transition cursor-pointer group ${editingPointId === p.id ? 'border-yellow-500 ring-1 ring-yellow-500 bg-yellow-50' : 'border-gray-200'}`}
                    >
                        <div className="w-12 h-12 bg-gray-100 rounded-md overflow-hidden flex-shrink-0 relative">
                            <img src={p.photoUrl} alt="" className="w-full h-full object-cover" />
                             <div className="absolute top-0 left-0 bg-black/50 text-white text-[10px] px-1 rounded-br">#{idx + 1}</div>
                        </div>
                        <div className="flex-1 min-w-0">
                            <div className="flex justify-between items-start">
                                <div>
                                    <h5 className="font-bold text-sm text-gray-800 truncate">
                                        {p.title}
                                    </h5>
                                    <p className="text-[10px] text-blue-600 font-bold mt-0.5 flex items-center">
                                        <ClockIcon size={10} className="mr-1"/>
                                        {new Date(p.date).toLocaleString([], {month:'numeric', day:'numeric', hour:'2-digit', minute:'2-digit'})}
                                    </p>
                                </div>
                                <button 
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        if(window.confirm('삭제하시겠습니까?')) {
                                            const filtered = points.filter(pt => pt.id !== p.id);
                                            // Sort after delete just in case
                                            filtered.sort(robustSort);
                                            const reordered = filtered.map((pt, i) => ({...pt, order: i}));
                                            setPoints(reordered);
                                            if(editingPointId === p.id) clearForm();
                                        }
                                    }}
                                    className="text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity p-1"
                                >
                                    <Trash2 size={14} />
                                </button>
                            </div>
                            <p className="text-xs text-gray-500 truncate mt-0.5">{p.locationName}</p>
                        </div>
                    </div>
                ))}
             </div>
        </div>

        {/* 3. Input Form Area (Scrollable) */}
        <div className="flex-1 overflow-y-auto p-5 bg-white">
            <div className={`p-4 rounded-xl border transition-all ${editingPointId ? 'border-yellow-400 bg-yellow-50/30 shadow-inner' : 'border-indigo-100 bg-indigo-50/30'}`}>
                <div className="flex justify-between items-center mb-4">
                    <h3 className="font-bold text-gray-800 flex items-center text-sm">
                        {editingPointId ? 
                            <><Pencil size={16} className="mr-2 text-yellow-600"/> 선택한 지점 수정 중</> : 
                            <><Plus size={16} className="mr-2 text-indigo-600"/> 새 지점 정보 입력</>
                        }
                    </h3>
                    {editingPointId && (
                        <button onClick={clearForm} className="text-xs flex items-center text-gray-500 hover:text-gray-800 bg-white px-2 py-1 rounded border shadow-sm">
                            <X size={12} className="mr-1"/> 수정 취소
                        </button>
                    )}
                </div>

                <div className="space-y-3">
                    <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1">장소명</label>
                        <input 
                            type="text" 
                            className="w-full p-2.5 border rounded-lg text-sm focus:ring-1 focus:ring-indigo-500 outline-none"
                            placeholder="지도 클릭 시 자동 입력"
                            value={locationName}
                            onChange={(e) => setLocationName(e.target.value)}
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-blue-600 font-bold mb-1">방문 날짜 (필수: 시간순 정렬 기준)</label>
                        <input 
                            type="datetime-local" 
                            className="w-full p-2.5 border border-blue-200 rounded-lg text-sm outline-none bg-blue-50 focus:bg-white transition"
                            value={date}
                            onChange={(e) => setDate(e.target.value)}
                            required
                        />
                    </div>
                    
                    <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1">다음 장소까지 이동 수단</label>
                        <select 
                            className="w-full p-2.5 border rounded-lg text-sm outline-none bg-white"
                            value={transport}
                            onChange={(e) => setTransport(e.target.value as TransportType)}
                        >
                            <option value="CAR">자동차 🚗</option>
                            <option value="WALK">도보 🚶</option>
                            <option value="TRAIN">기차 🚆</option>
                            <option value="BUS">버스 🚌</option>
                            <option value="PLANE">비행기 ✈️</option>
                            <option value="SHIP">배 ⛴️</option>
                        </select>
                    </div>

                    <div>
                         <label className="block text-xs font-medium text-gray-500 mb-1">제목</label>
                        <input 
                            type="text" 
                            className="w-full p-2.5 border rounded-lg text-sm outline-none"
                            placeholder="지점의 제목 (예: 맛있는 점심)"
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                        />
                    </div>

                    <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1">이야기</label>
                        <textarea 
                            className="w-full p-2.5 border rounded-lg text-sm outline-none min-h-[80px]"
                            placeholder="이곳에서의 추억을 기록하세요..."
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                        />
                    </div>

                    {/* Photo Upload */}
                    <div>
                         <label className="block text-xs font-medium text-gray-500 mb-1">사진 (파일 또는 URL)</label>
                         <div className="space-y-2">
                             <div className="flex gap-2">
                                <label className={`flex-1 flex flex-col items-center justify-center h-24 border-2 border-dashed rounded-lg cursor-pointer hover:bg-gray-50 transition relative overflow-hidden ${photoFile ? 'border-indigo-500 bg-indigo-50' : 'border-gray-300'}`}>
                                    {previewUrl && !photoUrl ? (
                                        <img src={previewUrl} alt="Preview" className="h-full w-full object-cover" />
                                    ) : (
                                        <div className="flex flex-col items-center justify-center p-2 text-center">
                                            <ImageIcon className="w-5 h-5 text-gray-400 mb-1" />
                                            <span className="text-[10px] text-gray-500 break-all">{photoFile ? photoFile.name : '파일 선택'}</span>
                                        </div>
                                    )}
                                    <input type="file" className="hidden" accept="image/*" onChange={handleFileChange} />
                                </label>
                                
                                {previewUrl && (
                                    <div className="w-24 h-24 rounded-lg overflow-hidden border border-gray-200 bg-gray-100 relative shrink-0">
                                        <img src={previewUrl} className="w-full h-full object-cover" alt="Current" />
                                        <button 
                                            onClick={() => { setPhotoFile(null); setPreviewUrl(''); setPhotoUrl(''); }}
                                            className="absolute top-0 right-0 bg-red-500 text-white p-1 rounded-bl-lg hover:bg-red-600 transition"
                                            title="사진 삭제"
                                        >
                                            <Trash2 size={12} />
                                        </button>
                                    </div>
                                )}
                             </div>
                             <input 
                                type="text" 
                                className="w-full p-2 border rounded-lg text-xs"
                                placeholder="이미지 URL 직접 입력"
                                value={photoUrl}
                                onChange={(e) => {
                                    setPhotoUrl(e.target.value);
                                    setPreviewUrl(e.target.value);
                                    setPhotoFile(null);
                                }}
                            />
                            <p className="text-[10px] text-gray-400 flex items-center">
                                <AlertCircle size={10} className="mr-1"/> 파일 업로드가 안될 경우 URL을 입력하거나 Firebase Rules를 확인하세요.
                            </p>
                         </div>
                    </div>

                    <button 
                        onClick={handleAddOrUpdatePoint}
                        disabled={isUploadingPoint}
                        className={`w-full py-3 rounded-xl transition flex justify-center items-center font-bold text-white shadow-md ${
                            isUploadingPoint ? 'bg-gray-400' : 
                            editingPointId ? 'bg-yellow-500 hover:bg-yellow-600' : 'bg-indigo-600 hover:bg-indigo-700'
                        }`}
                    >
                    {isUploadingPoint ? <Loader2 className="animate-spin" size={20} /> : (editingPointId ? '지점 수정 완료' : '지점 추가')}
                    </button>
                </div>
            </div>
        </div>
        
        {/* 4. Footer Save Action */}
        <div className="p-4 bg-white border-t">
            <button 
            onClick={handleSaveTrip}
            disabled={isSaving || points.length < 2}
            className={`w-full text-white py-3.5 rounded-xl font-bold shadow-lg flex items-center justify-center text-lg ${isSaving || points.length < 2 ? 'bg-gray-400 cursor-not-allowed' : 'bg-green-600 hover:bg-green-700'}`}
            >
            {isSaving || isUploadingBgm ? <Loader2 className="animate-spin mr-2"/> : <Save size={20} className="mr-2" />}
            {isSaving ? '저장 중...' : '여행 지도 발행하기'}
            </button>
        </div>

      </div>

      {/* Map Area */}
      <div className="flex-1 relative bg-gray-200">
        <div ref={mapRef} className="w-full h-full absolute inset-0" />
        <div className="absolute top-4 left-4 z-10 bg-white/90 backdrop-blur px-4 py-3 rounded-xl shadow-lg border border-white/20">
          <p className="text-sm font-bold text-indigo-900 flex items-center">
            <MapPin size={16} className="mr-2 text-indigo-600"/>
            지도에서 위치를 클릭하여 추가하세요
          </p>
        </div>
      </div>
    </div>
  );
};

// Helper Icon
const ClockIcon = ({size, className}: {size:number, className?:string}) => (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
);

export default TripEditor;
