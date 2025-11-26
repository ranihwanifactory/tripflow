import React, { useEffect, useRef, useState } from 'react';
import { TripPoint, TransportType, TripData } from '../types';
import { db, auth, storage } from '../firebase';
import { collection, addDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { MapPin, Calendar, Truck, Save, Plus, Trash2, Search, Image as ImageIcon, Loader2 } from 'lucide-react';

const TripEditor: React.FC<{ onFinish: () => void }> = ({ onFinish }) => {
  const mapRef = useRef<HTMLDivElement>(null);
  const [map, setMap] = useState<any>(null);
  const [marker, setMarker] = useState<any>(null);
  const [points, setPoints] = useState<TripPoint[]>([]);
  const [tripTitle, setTripTitle] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isUploadingPoint, setIsUploadingPoint] = useState(false);

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

  useEffect(() => {
    if (!mapRef.current) return;

    const options = {
      center: new window.kakao.maps.LatLng(37.566826, 126.9786567),
      level: 3,
    };
    const newMap = new window.kakao.maps.Map(mapRef.current, options);
    setMap(newMap);

    const newMarker = new window.kakao.maps.Marker({
      position: newMap.getCenter(),
    });
    newMarker.setMap(newMap);
    setMarker(newMarker);

    // Map Click Event
    window.kakao.maps.event.addListener(newMap, 'click', (mouseEvent: any) => {
      const latlng = mouseEvent.latLng;
      newMarker.setPosition(latlng);
      setCurrentLat(latlng.getLat());
      setCurrentLng(latlng.getLng());
      
      // Reverse Geocoding
      const geocoder = new window.kakao.maps.services.Geocoder();
      geocoder.coord2Address(latlng.getLng(), latlng.getLat(), (result: any, status: any) => {
        if (status === window.kakao.maps.services.Status.OK) {
          setAddress(result[0].address.address_name);
        }
      });
    });
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setPhotoFile(file);
      setPreviewUrl(URL.createObjectURL(file));
      setPhotoUrl(''); // Clear manual URL if file selected
    }
  };

  const handleAddPoint = async () => {
    if (!title || !date) {
      alert('제목과 날짜는 필수입니다.');
      return;
    }

    setIsUploadingPoint(true);
    let finalPhotoUrl = photoUrl;

    try {
      // Handle File Upload if exists
      if (photoFile) {
        const userId = auth.currentUser?.uid || 'anonymous';
        const storageRef = ref(storage, `trip_images/${userId}/${Date.now()}_${photoFile.name}`);
        const snapshot = await uploadBytes(storageRef, photoFile);
        finalPhotoUrl = await getDownloadURL(snapshot.ref);
      } else if (!finalPhotoUrl) {
        // Fallback to random image if neither file nor url is provided
        finalPhotoUrl = `https://picsum.photos/400/300?random=${Math.random()}`;
      }

      const newPoint: TripPoint = {
        id: Date.now().toString(),
        lat: currentLat,
        lng: currentLng,
        locationName: locationName || address,
        address,
        date,
        transportToNext: transport,
        title,
        description,
        photoUrl: finalPhotoUrl,
        order: points.length,
      };

      const newPoints = [...points, newPoint];
      setPoints(newPoints);
      
      // Draw line
      if (map && newPoints.length > 1) {
         const linePath = newPoints.map(p => new window.kakao.maps.LatLng(p.lat, p.lng));
         const polyline = new window.kakao.maps.Polyline({
          path: linePath,
          strokeWeight: 5,
          strokeColor: '#4F46E5',
          strokeOpacity: 0.8,
          strokeStyle: 'solid'
        });
        polyline.setMap(map);
      }

      // Reset Form (keep date/transport for convenience)
      setTitle('');
      setDescription('');
      setLocationName('');
      setPhotoUrl('');
      setPhotoFile(null);
      setPreviewUrl('');
    } catch (error) {
      console.error("Error adding point:", error);
      alert("지점 등록 중 오류가 발생했습니다.");
    } finally {
      setIsUploadingPoint(false);
    }
  };

  const handleSaveTrip = async () => {
    if (!tripTitle) return alert('여행 제목을 입력해주세요.');
    if (points.length < 2) return alert('최소 2개 이상의 지점을 등록해주세요.');
    
    setIsSaving(true);
    try {
      const tripData: TripData = {
        userId: auth.currentUser?.uid || 'anonymous',
        title: tripTitle,
        points: points,
        createdAt: Date.now(),
      };
      await addDoc(collection(db, 'trips'), tripData);
      alert('여행이 성공적으로 저장되었습니다!');
      onFinish();
    } catch (e) {
      console.error(e);
      alert('저장 중 오류가 발생했습니다.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="flex flex-col h-screen md:flex-row">
      {/* Sidebar Form */}
      <div className="w-full md:w-96 bg-white shadow-lg overflow-y-auto z-10 flex flex-col p-6 border-r border-gray-200">
        <h2 className="text-2xl font-bold mb-6 text-indigo-700">새 여행 만들기</h2>
        
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-1">여행 제목</label>
          <input 
            type="text" 
            className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-indigo-500"
            placeholder="예: 3박 4일 제주도 여행"
            value={tripTitle}
            onChange={(e) => setTripTitle(e.target.value)}
          />
        </div>

        <div className="bg-gray-50 p-4 rounded-xl border border-gray-200 mb-6">
          <h3 className="font-semibold text-gray-700 mb-3 flex items-center">
            <Plus size={18} className="mr-2" /> 새 지점 등록
          </h3>
          
          <div className="space-y-3">
            <input 
              type="text" 
              className="w-full p-2 border rounded text-sm"
              placeholder="장소명 (지도 클릭 시 자동 주소)"
              value={locationName}
              onChange={(e) => setLocationName(e.target.value)}
            />
             <input 
              type="text" 
              className="w-full p-2 border rounded text-sm bg-gray-100"
              placeholder="주소 (자동 입력)"
              value={address}
              readOnly
            />
            <input 
              type="datetime-local" 
              className="w-full p-2 border rounded text-sm"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
            
            <div className="flex items-center space-x-2">
              <span className="text-sm text-gray-600">이동수단:</span>
              <select 
                className="flex-1 p-2 border rounded text-sm"
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

            <input 
              type="text" 
              className="w-full p-2 border rounded text-sm"
              placeholder="지점 제목 (예: 맛있는 점심)"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
            <textarea 
              className="w-full p-2 border rounded text-sm"
              placeholder="여행 이야기..."
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
             
             {/* Photo Upload Section */}
            <div className="space-y-2">
              <label className="text-xs font-medium text-gray-500">사진 등록</label>
              
              <label className={`flex flex-col items-center justify-center w-full h-32 border-2 border-dashed rounded-lg cursor-pointer hover:bg-gray-50 transition relative overflow-hidden ${photoFile ? 'border-indigo-500 bg-indigo-50' : 'border-gray-300'}`}>
                {previewUrl ? (
                    <img src={previewUrl} alt="Preview" className="h-full w-full object-cover rounded-lg" />
                ) : (
                    <div className="flex flex-col items-center justify-center pt-5 pb-6">
                        <ImageIcon className="w-8 h-8 text-gray-400 mb-2" />
                        <p className="text-xs text-gray-500">클릭하여 이미지 업로드</p>
                    </div>
                )}
                {/* Close/Remove button for preview */}
                {previewUrl && (
                  <button 
                    onClick={(e) => {
                      e.preventDefault();
                      setPhotoFile(null);
                      setPreviewUrl('');
                    }}
                    className="absolute top-1 right-1 bg-red-500 text-white rounded-full p-1 shadow-sm hover:bg-red-600"
                  >
                    <Trash2 size={12} />
                  </button>
                )}
                <input type="file" className="hidden" accept="image/*" onChange={handleFileChange} />
              </label>

              <input 
                type="text" 
                className="w-full p-2 border rounded text-sm text-gray-600"
                placeholder="또는 이미지 URL 직접 입력"
                value={photoUrl}
                onChange={(e) => {
                    setPhotoUrl(e.target.value);
                    if(e.target.value) {
                        setPhotoFile(null);
                        setPreviewUrl('');
                    }
                }}
              />
            </div>

            <button 
              onClick={handleAddPoint}
              disabled={isUploadingPoint}
              className={`w-full text-white py-2 rounded-lg transition flex justify-center items-center ${isUploadingPoint ? 'bg-indigo-400 cursor-not-allowed' : 'bg-indigo-600 hover:bg-indigo-700'}`}
            >
              {isUploadingPoint ? (
                <>
                  <Loader2 className="animate-spin mr-2" size={18} />
                  업로드 중...
                </>
              ) : (
                '지점 추가하기'
              )}
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto mb-4">
            <h4 className="font-medium text-gray-600 mb-2">등록된 경로 ({points.length})</h4>
            <div className="space-y-2">
              {points.map((p, idx) => (
                <div key={p.id} className="p-3 bg-white border rounded-lg shadow-sm flex justify-between items-start">
                  <div className="flex items-start">
                    {p.photoUrl && <img src={p.photoUrl} alt="thumb" className="w-10 h-10 rounded object-cover mr-2 bg-gray-100" />}
                    <div>
                      <div className="font-bold text-sm text-indigo-900">#{idx + 1} {p.title}</div>
                      <div className="text-xs text-gray-500">{p.locationName}</div>
                    </div>
                  </div>
                  <button 
                    onClick={() => setPoints(points.filter(pt => pt.id !== p.id))}
                    className="text-red-400 hover:text-red-600"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
            </div>
        </div>

        <button 
          onClick={handleSaveTrip}
          disabled={isSaving || points.length < 2}
          className={`w-full text-white py-3 rounded-xl font-bold shadow-lg flex items-center justify-center ${isSaving || points.length < 2 ? 'bg-gray-400 cursor-not-allowed' : 'bg-green-600 hover:bg-green-700'}`}
        >
          <Save size={20} className="mr-2" />
          {isSaving ? '저장 중...' : '여행 지도 발행하기'}
        </button>
      </div>

      {/* Map Area */}
      <div className="flex-1 relative bg-gray-200">
        <div ref={mapRef} className="w-full h-full" />
        <div className="absolute top-4 left-4 z-10 bg-white px-4 py-2 rounded shadow text-sm font-medium text-gray-600">
          지도에서 위치를 클릭하여 추가하세요
        </div>
      </div>
    </div>
  );
};

export default TripEditor;