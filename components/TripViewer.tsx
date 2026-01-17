
import React, { useEffect, useRef, useState, useMemo } from 'react';
import { TripData, TransportType, Review, TripPoint } from '../types';
import { MapPin, ArrowDown, X, Clock, Navigation, Star, Send, Globe, Layers, Trash2, Pencil, Check, Share2, Link as LinkIcon, Music, Play, Pause, Volume2, VolumeX, Plus, Minus, Sun, Moon } from 'lucide-react';
import { db, auth } from '../firebase';
import { collection, addDoc, query, where, onSnapshot, deleteDoc, updateDoc, doc } from 'firebase/firestore';

interface TripViewerProps {
  trip: TripData;
  onClose: () => void;
}

const SCROLL_HEIGHT_MULTIPLIER = 1.3;

const getTransportIcon = (type: TransportType) => {
  switch (type) {
    case 'PLANE': return '✈️';
    case 'TRAIN': return '🚆';
    case 'SHIP': return '⛴️';
    case 'WALK': return '🚶';
    case 'BUS': return '🚌';
    case 'CAR':
    default: return '🚗';
  }
};

const getTransportLabel = (type: TransportType) => {
    switch (type) {
      case 'PLANE': return '비행기';
      case 'TRAIN': return '기차';
      case 'SHIP': return '배';
      case 'WALK': return '도보';
      case 'BUS': return '버스';
      case 'CAR':
      default: return '자동차';
    }
  };

const robustSort = (a: TripPoint, b: TripPoint) => {
    const timeA = new Date(a.date).getTime();
    const timeB = new Date(b.date).getTime();
    if (!isNaN(timeA) && !isNaN(timeB)) {
        if (timeA !== timeB) return timeA - timeB;
    }
    const strComp = a.date.localeCompare(b.date);
    if (strComp !== 0) return strComp;
    return a.id.localeCompare(b.id);
};

const getQuadraticBezierPoint = (t: number, p0: any, p1: any, p2: any) => {
    const x = (1 - t) * (1 - t) * p0.getLng() + 2 * (1 - t) * t * p1.getLng() + t * t * p2.getLng();
    const y = (1 - t) * (1 - t) * p0.getLat() + 2 * (1 - t) * t * p1.getLat() + t * t * p2.getLat();
    return new window.kakao.maps.LatLng(y, x);
};

const getControlPoint = (start: any, end: any, curvature: number = 0.2, direction: number = 1) => {
    const startLat = start.getLat();
    const startLng = start.getLng();
    const endLat = end.getLat();
    const endLng = end.getLng();
    const midLat = (startLat + endLat) / 2;
    const midLng = (startLng + endLng) / 2;
    const dLat = endLat - startLat;
    const dLng = endLng - startLng;
    const normalLat = -dLng;
    const normalLng = dLat;
    const controlLat = midLat + normalLat * curvature * direction;
    const controlLng = midLng + normalLng * curvature * direction;
    return new window.kakao.maps.LatLng(controlLat, controlLng);
};

const generateCurvePath = (start: any, end: any, control: any, segments: number = 50) => {
    const path = [];
    for (let i = 0; i <= segments; i++) {
        const t = i / segments;
        path.push(getQuadraticBezierPoint(t, start, control, end));
    }
    return path;
};


const TripViewer: React.FC<TripViewerProps> = ({ trip, onClose }) => {
  const mapRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<(HTMLDivElement | null)[]>([]);
  
  const [map, setMap] = useState<any>(null);
  const [transportOverlay, setTransportOverlay] = useState<any>(null);
  const [traveledPolyline, setTraveledPolyline] = useState<any>(null);
  
  const [isDarkMode, setIsDarkMode] = useState(() => document.documentElement.classList.contains('dark'));
  const [mapType, setMapType] = useState<'ROADMAP' | 'HYBRID'>('HYBRID');

  const [reviews, setReviews] = useState<Review[]>([]);
  const [newRating, setNewRating] = useState(5);
  const [newComment, setNewComment] = useState('');
  const [isSubmittingReview, setIsSubmittingReview] = useState(false);

  const [editingReviewId, setEditingReviewId] = useState<string | null>(null);
  const [editReviewText, setEditReviewText] = useState('');
  const [editReviewRating, setEditReviewRating] = useState(5);

  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const youtubePlayerRef = useRef<any>(null);

  const sortedPoints = useMemo(() => {
    if (!trip || !trip.points) return [];
    return [...trip.points].sort(robustSort);
  }, [trip]);

  const pathSegments = useMemo(() => {
    if (!window.kakao || !window.kakao.maps || sortedPoints.length < 2) return [];

    const segments = [];
    for (let i = 0; i < sortedPoints.length - 1; i++) {
        const start = new window.kakao.maps.LatLng(sortedPoints[i].lat, sortedPoints[i].lng);
        const end = new window.kakao.maps.LatLng(sortedPoints[i+1].lat, sortedPoints[i+1].lng);
        const direction = i % 2 === 0 ? 1 : -1;
        const control = getControlPoint(start, end, 0.25, direction);
        const curvePath = generateCurvePath(start, end, control);
        
        segments.push({
            start,
            end,
            control,
            curvePath,
            data: sortedPoints[i]
        });
    }
    return segments;
  }, [sortedPoints]);

  const fullBackgroundPath = useMemo(() => {
      return pathSegments.flatMap(seg => seg.curvePath);
  }, [pathSegments]);


  useEffect(() => {
    if (!trip.bgmType || trip.bgmType === 'NONE' || !trip.bgmUrl) return;

    if (youtubePlayerRef.current) {
        youtubePlayerRef.current.destroy();
        youtubePlayerRef.current = null;
    }
    if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
    }

    if (trip.bgmType === 'FILE') {
        const audio = new Audio(trip.bgmUrl);
        audio.loop = true;
        audio.volume = 0.5;
        audioRef.current = audio;
        audio.play().then(() => setIsPlaying(true)).catch(e => console.log("Autoplay blocked:", e));
        
        return () => {
            audio.pause();
            audio.src = '';
            audioRef.current = null;
        };
    } else if (trip.bgmType === 'YOUTUBE') {
        const initPlayer = () => {
            if (!window.YT || !window.YT.Player) return;
            
            youtubePlayerRef.current = new window.YT.Player('youtube-player', {
                height: '0',
                width: '0',
                videoId: trip.bgmUrl,
                playerVars: {
                    'playsinline': 1,
                    'controls': 0,
                    'loop': 1,
                    'playlist': trip.bgmUrl, 
                    'origin': window.location.origin
                },
                events: {
                    'onReady': (event: any) => {
                        event.target.setVolume(50);
                        event.target.playVideo();
                        setIsPlaying(true);
                    },
                    'onStateChange': (event: any) => {
                        if (event.data === window.YT.PlayerState.PLAYING) {
                            setIsPlaying(true);
                        } else if (event.data === window.YT.PlayerState.PAUSED) {
                            setIsPlaying(false);
                        }
                    }
                }
            });
        };

        if (window.YT && window.YT.Player) {
            initPlayer();
        } else {
            if (!document.getElementById('youtube-iframe-api')) {
                const tag = document.createElement('script');
                tag.id = 'youtube-iframe-api';
                tag.src = "https://www.youtube.com/iframe_api";
                const firstScriptTag = document.getElementsByTagName('script')[0];
                firstScriptTag.parentNode?.insertBefore(tag, firstScriptTag);
            }
            window.onYouTubeIframeAPIReady = initPlayer;
        }

        return () => {
            if (youtubePlayerRef.current) {
                youtubePlayerRef.current.destroy();
                youtubePlayerRef.current = null;
            }
        };
    }
  }, [trip.bgmType, trip.bgmUrl]);

  const togglePlay = () => {
      if (trip.bgmType === 'FILE' && audioRef.current) {
          if (isPlaying) { audioRef.current.pause(); setIsPlaying(false); } 
          else { audioRef.current.play(); setIsPlaying(true); }
      } else if (trip.bgmType === 'YOUTUBE' && youtubePlayerRef.current) {
          if (isPlaying) { youtubePlayerRef.current.pauseVideo(); } 
          else { youtubePlayerRef.current.playVideo(); }
      }
  };

  const toggleMute = () => {
      if (trip.bgmType === 'FILE' && audioRef.current) {
          audioRef.current.muted = !isMuted;
          setIsMuted(!isMuted);
      } else if (trip.bgmType === 'YOUTUBE' && youtubePlayerRef.current) {
          if (isMuted) { youtubePlayerRef.current.unMute(); } 
          else { youtubePlayerRef.current.mute(); }
          setIsMuted(!isMuted);
      }
  };

  useEffect(() => {
    if(!trip.id) return;
    const q = query(collection(db, 'reviews'), where('tripId', '==', trip.id));
    const unsubscribe = onSnapshot(q, (snapshot) => {
        const fetchedReviews: Review[] = [];
        snapshot.forEach(doc => fetchedReviews.push({ id: doc.id, ...doc.data() } as Review));
        fetchedReviews.sort((a, b) => b.createdAt - a.createdAt);
        setReviews(fetchedReviews);
    });
    return unsubscribe;
  }, [trip.id]);

  const handleSubmitReview = async () => {
    if (!auth.currentUser || !trip.id || !newComment.trim()) return;
    setIsSubmittingReview(true);
    try {
        await addDoc(collection(db, 'reviews'), {
            tripId: trip.id,
            userId: auth.currentUser.uid,
            userName: auth.currentUser.displayName || 'Anonymous',
            userPhoto: auth.currentUser.photoURL,
            rating: newRating,
            text: newComment,
            createdAt: Date.now()
        });
        setNewComment('');
        setNewRating(5);
    } catch (e) { console.error(e); } finally { setIsSubmittingReview(false); }
  };

  useEffect(() => {
    if (!mapRef.current || sortedPoints.length === 0) return;
    mapRef.current.innerHTML = '';
    const startPos = new window.kakao.maps.LatLng(sortedPoints[0].lat, sortedPoints[0].lng);
    const options = {
      center: startPos,
      level: 9, 
      draggable: false, 
      zoomable: false, 
      disableDoubleClickZoom: true,
      mapTypeId: mapType === 'HYBRID' ? window.kakao.maps.MapTypeId.HYBRID : window.kakao.maps.MapTypeId.ROADMAP
    };
    const newMap = new window.kakao.maps.Map(mapRef.current, options);
    setMap(newMap);

    const resizeObserver = new ResizeObserver(() => newMap.relayout());
    resizeObserver.observe(mapRef.current);

    if (fullBackgroundPath.length > 0) {
        new window.kakao.maps.Polyline({
          path: fullBackgroundPath,
          strokeWeight: 6,
          strokeColor: isDarkMode ? '#FFFFFF' : '#4F46E5',
          strokeOpacity: 0.2,
          strokeStyle: 'solid'
        }).setMap(newMap);
    }

    const activePolyline = new window.kakao.maps.Polyline({
        path: [], strokeWeight: 6, strokeColor: '#EF4444', strokeOpacity: 1, strokeStyle: 'solid'
    });
    activePolyline.setMap(newMap);
    setTraveledPolyline(activePolyline);

    sortedPoints.forEach((p, index) => {
      const markerContent = document.createElement('div');
      markerContent.innerHTML = `
        <div style="width:28px; height:28px; background:#4F46E5; color:white; font-weight:900; font-size:12px; display:flex; align-items:center; justify-content:center; border-radius:10px; border:2px solid white; box-shadow:0 4px 10px rgba(0,0,0,0.3);">
            ${index + 1}
        </div>`;
      new window.kakao.maps.CustomOverlay({
        position: new window.kakao.maps.LatLng(p.lat, p.lng),
        content: markerContent, yAnchor: 0.5, zIndex: 10
      }).setMap(newMap);
    });

    const transportContent = document.createElement('div');
    transportContent.className = 'transport-icon text-4xl filter drop-shadow-2xl transition-all duration-300';
    transportContent.innerText = getTransportIcon(sortedPoints[0].transportToNext);
    const overlay = new window.kakao.maps.CustomOverlay({ position: startPos, content: transportContent, zIndex: 100 });
    overlay.setMap(newMap);
    setTransportOverlay(overlay);
    return () => resizeObserver.disconnect();
  }, [fullBackgroundPath, sortedPoints, isDarkMode]);

  useEffect(() => {
     if (map && window.kakao) map.setMapTypeId(mapType === 'HYBRID' ? window.kakao.maps.MapTypeId.HYBRID : window.kakao.maps.MapTypeId.ROADMAP);
  }, [map, mapType]);

  useEffect(() => {
    const handleScroll = () => {
      if (!scrollContainerRef.current || !map || !transportOverlay || !traveledPolyline || pathSegments.length === 0) return;
      const scrollTop = scrollContainerRef.current.scrollTop;
      const vh = window.innerHeight;
      const scrollStart = vh;
      const sectionHeight = vh * SCROLL_HEIGHT_MULTIPLIER;
      const relativeScroll = Math.max(0, scrollTop - scrollStart);
      const currentSectionIndex = Math.floor(relativeScroll / sectionHeight);
      const sectionProgress = (relativeScroll % sectionHeight) / sectionHeight;
      
      if (currentSectionIndex < pathSegments.length) {
          const segment = pathSegments[currentSectionIndex];
          const currentPos = getQuadraticBezierPoint(sectionProgress, segment.start, segment.control, segment.end);
          transportOverlay.setPosition(currentPos);
          map.panTo(currentPos);
          const iconDiv = transportOverlay.getContent();
          if(iconDiv) {
              const iconChar = getTransportIcon(segment.data.transportToNext);
              if (iconDiv.innerText !== iconChar) iconDiv.innerText = iconChar;
              if (segment.data.transportToNext === 'PLANE') {
                  const nextPos = getQuadraticBezierPoint(Math.min(sectionProgress + 0.1, 1), segment.start, segment.control, segment.end);
                  const angle = Math.atan2(nextPos.getLat() - currentPos.getLat(), nextPos.getLng() - currentPos.getLng()) * (180 / Math.PI);
                  iconDiv.style.transform = `translate(-50%, -50%) rotate(${45 - angle}deg)`;
              } else iconDiv.style.transform = `translate(-50%, -50%) rotate(0deg)`;
          }
          const historyPath = pathSegments.slice(0, currentSectionIndex).flatMap(s => s.curvePath);
          const currentPartialPath = generateCurvePath(segment.start, segment.end, segment.control, Math.floor(sectionProgress * 50));
          traveledPolyline.setPath([...historyPath, ...currentPartialPath]);
      } else {
          transportOverlay.setPosition(new window.kakao.maps.LatLng(sortedPoints[sortedPoints.length-1].lat, sortedPoints[sortedPoints.length-1].lng));
          traveledPolyline.setPath(fullBackgroundPath); 
      }

      sortedPoints.forEach((_, idx) => {
        const card = cardRefs.current[idx];
        if (!card) return;
        let localProgress = currentSectionIndex === idx ? sectionProgress : currentSectionIndex > idx ? 1 : 0;
        let opacity = 0, translateY = 0, translateX = 0, scale = 1;
        if (localProgress < 0.15) {
            opacity = localProgress / 0.15;
            translateY = 40 * (1 - opacity); 
            translateX = -40 * (1 - opacity);
            scale = 0.9;
        } else if (localProgress < 0.85) { opacity = 1; scale = 1; } 
        else {
            const exit = (localProgress - 0.85) / 0.15;
            opacity = 1 - exit; translateY = -60 * exit; translateX = -40 * exit; scale = 1.05;
        }
        card.style.opacity = opacity.toString();
        card.style.transform = `translateY(${translateY}px) translateX(${translateX}px) scale(${scale})`;
        card.style.visibility = opacity <= 0.01 ? 'hidden' : 'visible';
      });
    };
    scrollContainerRef.current?.addEventListener('scroll', handleScroll);
    return () => scrollContainerRef.current?.removeEventListener('scroll', handleScroll);
  }, [map, transportOverlay, traveledPolyline, pathSegments, sortedPoints]);

  const buttonClass = isDarkMode 
    ? "bg-slate-900/60 hover:bg-slate-800 backdrop-blur-xl text-white border-white/10" 
    : "bg-white/90 hover:bg-white text-gray-800 shadow-xl border-stone-200";

  return (
    <div className={`fixed inset-0 z-50 transition-colors duration-1000 ${isDarkMode ? 'bg-slate-950 text-white' : 'bg-stone-50 text-gray-900'}`}>
      <div className="fixed inset-0 z-0 overflow-hidden">
        <div ref={mapRef} className={`w-full h-full transition-all duration-700 ${isDarkMode ? 'opacity-50 grayscale contrast-125' : 'opacity-100'}`} />
        <div className={`absolute inset-0 pointer-events-none ${isDarkMode ? 'bg-gradient-to-r from-slate-950/90 via-slate-950/20 to-transparent' : 'bg-gradient-to-r from-white/80 via-white/10 to-transparent'}`} />
      </div>

      <div id="youtube-player" className="hidden" />

      {/* Dynamic Controls */}
      <div className="fixed top-8 right-8 z-50 flex gap-4">
          <div className={`backdrop-blur-2xl px-4 py-2 rounded-2xl border shadow-2xl flex items-center space-x-4 transition-all ${buttonClass}`}>
              <button onClick={() => setIsDarkMode(!isDarkMode)} className="hover:text-indigo-400 p-1">
                  {isDarkMode ? <Sun size={20}/> : <Moon size={20}/>}
              </button>
              <div className="w-px h-4 bg-gray-500/30" />
              <button onClick={togglePlay} className="hover:text-indigo-400 p-1">{isPlaying ? <Pause size={20} fill="currentColor"/> : <Play size={20} fill="currentColor"/>}</button>
              <button onClick={toggleMute} className="hover:text-indigo-400 p-1">{isMuted ? <VolumeX size={20}/> : <Volume2 size={20}/>}</button>
              <div className="w-px h-4 bg-gray-500/30" />
              <button onClick={onClose} className="hover:rotate-90 transition-transform p-1 text-red-500"><X size={24} /></button>
          </div>
      </div>

      <div ref={scrollContainerRef} className="relative z-10 w-full h-full overflow-y-auto no-scrollbar scroll-smooth">
        <div className="h-screen w-full flex flex-col justify-center items-center text-center p-8 relative overflow-hidden">
          {trip.thumbnailUrl && <img src={trip.thumbnailUrl} className="absolute inset-0 z-[-1] w-full h-full object-cover blur-2xl scale-125 opacity-40" alt="" />}
          <div className="animate-fade-in-up max-w-4xl space-y-6">
            <span className={`inline-block px-5 py-2 rounded-full border text-xs font-black tracking-widest uppercase backdrop-blur-md ${isDarkMode ? 'bg-white/5 border-white/10' : 'bg-indigo-600/10 border-indigo-600/20 text-indigo-700'}`}>TripFlow Log</span>
            <h1 className="text-6xl md:text-8xl font-black leading-tight drop-shadow-2xl italic">{trip.title}</h1>
            <div className="flex items-center justify-center space-x-6 text-sm font-black opacity-60 uppercase tracking-tighter italic">
               <span>{new Date(trip.createdAt).toLocaleDateString()}</span>
               <span className="w-2 h-2 bg-indigo-600 rounded-full"/>
               <span>{sortedPoints.length} Checkpoints</span>
            </div>
          </div>
          <div className="absolute bottom-12 animate-bounce flex flex-col items-center opacity-40">
             <span className="text-[10px] font-black uppercase tracking-widest mb-2">Keep Scrolling</span>
             <ArrowDown size={32} />
          </div>
        </div>

        <div className="w-full">
            {sortedPoints.map((point, idx) => (
            <div key={point.id} style={{ height: `${SCROLL_HEIGHT_MULTIPLIER * 100}vh` }} className="w-full relative">
                <div className="sticky top-0 h-screen w-full flex items-center justify-start p-6 md:pl-20">
                    <div ref={el => cardRefs.current[idx] = el} className={`w-full max-w-sm rounded-[2.5rem] overflow-hidden transform opacity-0 shadow-2xl transition-all duration-700 border ${isDarkMode ? 'bg-slate-900/90 backdrop-blur-2xl border-white/10' : 'bg-white/95 backdrop-blur-xl border-stone-200'}`}>
                        <div className="relative h-64 group">
                            <img src={point.photoUrl} alt="" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-1000" />
                            <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent" />
                            <div className="absolute top-6 left-6"><span className="bg-indigo-600 text-white px-3 py-1 rounded-xl text-[10px] font-black italic">POINT {idx + 1}</span></div>
                            <div className="absolute bottom-0 left-0 p-8 w-full text-white">
                                <h2 className="text-3xl font-black italic truncate">{point.title}</h2>
                            </div>
                        </div>
                        <div className="p-8 space-y-5">
                            <div className="flex items-start">
                                <div className={`p-2.5 rounded-2xl mr-4 border ${isDarkMode ? 'bg-indigo-500/20 text-indigo-400 border-indigo-500/30' : 'bg-indigo-50 text-indigo-600 border-indigo-100'}`}><MapPin size={20} /></div>
                                <div className="min-w-0">
                                    <p className="text-lg font-black italic truncate">{point.locationName}</p>
                                    <p className={`text-xs font-medium truncate opacity-60`}>{point.address}</p>
                                </div>
                            </div>
                            <p className={`text-base font-medium leading-relaxed italic ${isDarkMode ? 'text-slate-300' : 'text-stone-600'}`}>{point.description}</p>
                            {idx < sortedPoints.length - 1 && (
                                <div className={`pt-6 border-t flex items-center justify-between ${isDarkMode ? 'border-white/10' : 'border-stone-100'}`}>
                                    <span className="text-[10px] font-black uppercase opacity-40">Next Step</span>
                                    <div className={`flex items-center px-4 py-2 rounded-2xl text-xs font-black italic border ${isDarkMode ? 'bg-indigo-950/40 border-indigo-500/30' : 'bg-stone-100 border-stone-200'}`}>
                                        <span className="mr-2">{getTransportIcon(point.transportToNext)}</span>
                                        {getTransportLabel(point.transportToNext)}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
            ))}
        </div>

        <div className={`min-h-screen flex flex-col justify-center items-center p-8 relative z-20 pb-32 transition-colors duration-1000 ${isDarkMode ? 'bg-slate-950' : 'bg-stone-50'}`}>
            <h2 className="text-5xl font-black italic mb-8">End of the Road</h2>
            <div className="flex gap-6 mb-20">
                <button onClick={() => scrollContainerRef.current?.scrollTo({top: 0, behavior: 'smooth'})} className={`px-10 py-4 rounded-[1.5rem] text-sm font-black italic border transition-all ${isDarkMode ? 'bg-white/5 hover:bg-white/10 border-white/10' : 'bg-white hover:bg-stone-100 border-stone-200 shadow-xl'}`}>Replay Journey</button>
                <button onClick={onClose} className="px-10 py-4 bg-indigo-600 text-white rounded-[1.5rem] text-sm font-black italic hover:bg-indigo-700 transition shadow-2xl shadow-indigo-500/40">Finish Log</button>
            </div>

            <div className={`w-full max-w-xl rounded-[3rem] p-10 border shadow-2xl ${isDarkMode ? 'bg-slate-900/50 border-white/10' : 'bg-white border-stone-200'}`}>
                <h3 className="text-3xl font-black italic mb-8 flex items-center">
                    <Star className="text-yellow-400 mr-3" fill="currentColor" size={28} /> Traveler's Reviews
                </h3>
                {auth.currentUser ? (
                    <div className="mb-10 space-y-4">
                        <div className="flex justify-between items-center"><span className="text-xs font-black uppercase opacity-50 italic">Rate the Trip</span>
                            <div className="flex space-x-1">{[1,2,3,4,5].map(s => <button key={s} onClick={() => setNewRating(s)} className="transition-transform hover:scale-125"><Star size={24} className={s <= newRating ? "text-yellow-400" : "text-gray-600"} fill="currentColor"/></button>)}</div>
                        </div>
                        <div className="flex gap-3">
                            <input value={newComment} onChange={e => setNewComment(e.target.value)} placeholder="당신의 감상을 남겨주세요..." className={`flex-1 px-6 py-4 rounded-2xl text-sm font-medium outline-none transition ${isDarkMode ? 'bg-slate-800 focus:bg-slate-700' : 'bg-stone-100 focus:bg-stone-200'}`} />
                            <button onClick={handleSubmitReview} className="bg-indigo-600 hover:bg-indigo-700 text-white p-4 rounded-2xl transition shadow-xl"><Send size={20}/></button>
                        </div>
                    </div>
                ) : <div className="mb-10 p-8 text-center bg-indigo-600/10 rounded-[2rem] border border-indigo-600/20"><p className="text-sm font-black italic mb-4">Leave your footprint. Login to review.</p></div>}

                <div className="space-y-6 max-h-[400px] overflow-y-auto no-scrollbar">
                    {reviews.map(r => (
                        <div key={r.id} className={`p-6 rounded-[2rem] border transition ${isDarkMode ? 'bg-slate-800/40 border-white/5' : 'bg-stone-50 border-stone-100'}`}>
                            <div className="flex justify-between items-start mb-3">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-full bg-indigo-600 overflow-hidden border-2 border-white">{r.userPhoto ? <img src={r.userPhoto} className="w-full h-full object-cover"/> : r.userName[0]}</div>
                                    <div><p className="font-black italic text-sm">{r.userName}</p><div className="flex text-yellow-400 space-x-0.5">{[...Array(r.rating)].map((_, i) => <Star key={i} size={10} fill="currentColor"/>)}</div></div>
                                </div>
                                <span className="text-[10px] font-black opacity-30 uppercase italic">{new Date(r.createdAt).toLocaleDateString()}</span>
                            </div>
                            <p className="text-sm font-medium ml-13 leading-relaxed opacity-80">{r.text}</p>
                        </div>
                    ))}
                </div>
            </div>
        </div>
      </div>
    </div>
  );
};

export default TripViewer;
