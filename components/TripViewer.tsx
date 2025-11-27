
import React, { useEffect, useRef, useState, useMemo } from 'react';
import { TripData, TransportType, Review, TripPoint } from '../types';
import { MapPin, ArrowDown, X, Clock, Navigation, Star, Send, Globe, Layers, Trash2, Pencil, Check, Share2, Link as LinkIcon, Music, Play, Pause, Volume2, VolumeX, Plus, Minus } from 'lucide-react';
import { db, auth } from '../firebase';
import { collection, addDoc, query, where, onSnapshot, deleteDoc, updateDoc, doc } from 'firebase/firestore';

interface TripViewerProps {
  trip: TripData;
  onClose: () => void;
}

const SCROLL_HEIGHT_MULTIPLIER = 1.2;

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
          if (isPlaying) {
              audioRef.current.pause();
              setIsPlaying(false);
          } else {
              audioRef.current.play();
              setIsPlaying(true);
          }
      } else if (trip.bgmType === 'YOUTUBE' && youtubePlayerRef.current) {
          if (typeof youtubePlayerRef.current.getPlayerState !== 'function') return;

          if (isPlaying) {
              youtubePlayerRef.current.pauseVideo();
          } else {
              youtubePlayerRef.current.playVideo();
          }
      }
  };

  const toggleMute = () => {
      if (trip.bgmType === 'FILE' && audioRef.current) {
          audioRef.current.muted = !isMuted;
          setIsMuted(!isMuted);
      } else if (trip.bgmType === 'YOUTUBE' && youtubePlayerRef.current) {
          if (typeof youtubePlayerRef.current.isMuted !== 'function') return;
          
          if (isMuted) {
              youtubePlayerRef.current.unMute();
          } else {
              youtubePlayerRef.current.mute();
          }
          setIsMuted(!isMuted);
      }
  };

  useEffect(() => {
    if(!trip.id) return;
    const q = query(
        collection(db, 'reviews'), 
        where('tripId', '==', trip.id)
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
        const fetchedReviews: Review[] = [];
        snapshot.forEach(doc => fetchedReviews.push({ id: doc.id, ...doc.data() } as Review));
        fetchedReviews.sort((a, b) => b.createdAt - a.createdAt);
        setReviews(fetchedReviews);
    });
    return unsubscribe;
  }, [trip.id]);

  const handleSubmitReview = async () => {
    if (!auth.currentUser) {
        alert("로그인이 필요한 기능입니다.");
        return;
    }
    if (!trip.id) return;
    if (!newComment.trim()) return alert("리뷰 내용을 입력해주세요.");
    
    setIsSubmittingReview(true);
    try {
        await addDoc(collection(db, 'reviews'), {
            tripId: trip.id,
            userId: auth.currentUser.uid,
            userName: auth.currentUser.displayName || auth.currentUser.email?.split('@')[0] || '익명',
            userPhoto: auth.currentUser.photoURL,
            rating: newRating,
            text: newComment,
            createdAt: Date.now()
        });
        setNewComment('');
        setNewRating(5);
        alert("리뷰가 성공적으로 등록되었습니다!");
    } catch (e: any) {
        console.error("Error submitting review:", e);
        alert(`리뷰 작성 중 오류가 발생했습니다: ${e.message}`);
    } finally {
        setIsSubmittingReview(false);
    }
  };

  const handleDeleteReview = async (reviewId: string) => {
      if (!window.confirm("정말로 이 리뷰를 삭제하시겠습니까?")) return;
      try {
          await deleteDoc(doc(db, 'reviews', reviewId));
      } catch (e) {
          console.error("Error deleting review:", e);
          alert("리뷰 삭제 중 오류가 발생했습니다.");
      }
  };

  const startEditing = (review: Review) => {
      setEditingReviewId(review.id);
      setEditReviewText(review.text);
      setEditReviewRating(review.rating);
  };

  const cancelEditing = () => {
      setEditingReviewId(null);
      setEditReviewText('');
      setEditReviewRating(5);
  };

  const handleUpdateReview = async (reviewId: string) => {
      if (!editReviewText.trim()) return alert("내용을 입력해주세요.");
      try {
          await updateDoc(doc(db, 'reviews', reviewId), {
              text: editReviewText,
              rating: editReviewRating
          });
          setEditingReviewId(null);
      } catch (e) {
          console.error("Error updating review:", e);
          alert("리뷰 수정 중 오류가 발생했습니다.");
      }
  };

  const toggleMapType = () => {
    setMapType(prev => prev === 'ROADMAP' ? 'HYBRID' : 'ROADMAP');
  };

  const handleZoomIn = () => {
    if (map) {
        map.setLevel(map.getLevel() - 1, { animate: true });
    }
  };

  const handleZoomOut = () => {
    if (map) {
        map.setLevel(map.getLevel() + 1, { animate: true });
    }
  };

  const handleShareTrip = async () => {
      const url = `${window.location.origin}${window.location.pathname}?tripId=${trip.id}`;
      if (navigator.clipboard) {
          await navigator.clipboard.writeText(url);
          alert("여행지도 링크가 복사되었습니다!");
      } else {
          prompt("이 링크를 복사하세요:", url);
      }
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
      scrollwheel: false, 
      disableDoubleClickZoom: true,
      mapTypeId: mapType === 'HYBRID' ? window.kakao.maps.MapTypeId.HYBRID : window.kakao.maps.MapTypeId.ROADMAP
    };
    const newMap = new window.kakao.maps.Map(mapRef.current, options);
    setMap(newMap);

    const resizeObserver = new ResizeObserver(() => {
        newMap.relayout();
        newMap.setCenter(newMap.getCenter());
    });
    resizeObserver.observe(mapRef.current);

    setTimeout(() => {
        newMap.relayout();
        newMap.setCenter(startPos);
    }, 500);

    if (fullBackgroundPath.length > 0) {
        const backgroundPolyline = new window.kakao.maps.Polyline({
          path: fullBackgroundPath,
          strokeWeight: 6,
          strokeColor: '#FFFFFF',
          strokeOpacity: 0.3,
          strokeStyle: 'solid'
        });
        backgroundPolyline.setMap(newMap);
    }

    const activePolyline = new window.kakao.maps.Polyline({
        path: [],
        strokeWeight: 6,
        strokeColor: '#EF4444',
        strokeOpacity: 1,
        strokeStyle: 'solid'
    });
    activePolyline.setMap(newMap);
    setTraveledPolyline(activePolyline);

    sortedPoints.forEach((p, index) => {
      const pos = new window.kakao.maps.LatLng(p.lat, p.lng);
      const markerContent = document.createElement('div');
      markerContent.innerHTML = `
        <div style="
          width: 24px; 
          height: 24px; 
          background: #4F46E5; 
          color: white;
          font-weight: bold;
          font-size: 12px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 50%; 
          box-shadow: 0 0 8px rgba(255,255,255,0.8);
          border: 2px solid white;
        ">${index + 1}</div>
      `;
      const customOverlay = new window.kakao.maps.CustomOverlay({
        position: pos,
        content: markerContent,
        yAnchor: 0.5,
        zIndex: 10
      });
      customOverlay.setMap(newMap);
    });

    const transportContent = document.createElement('div');
    transportContent.className = 'transport-icon text-3xl filter drop-shadow-2xl transition-all duration-300 transform -translate-x-1/2 -translate-y-1/2';
    transportContent.style.textShadow = '0 4px 8px rgba(0,0,0,0.5)';
    transportContent.innerText = getTransportIcon(sortedPoints[0].transportToNext);

    const overlay = new window.kakao.maps.CustomOverlay({
      position: startPos,
      content: transportContent,
      zIndex: 100
    });
    overlay.setMap(newMap);
    setTransportOverlay(overlay);

    return () => {
        resizeObserver.disconnect();
    };

  }, [fullBackgroundPath, sortedPoints]);

  useEffect(() => {
     if (!map || !window.kakao) return;
     const typeId = mapType === 'HYBRID' ? window.kakao.maps.MapTypeId.HYBRID : window.kakao.maps.MapTypeId.ROADMAP;
     map.setMapTypeId(typeId);
  }, [map, mapType]);

  useEffect(() => {
    const handleScroll = () => {
      if (!scrollContainerRef.current || !map || !transportOverlay || !traveledPolyline || pathSegments.length === 0) return;

      const container = scrollContainerRef.current;
      const scrollTop = container.scrollTop;
      const vh = window.innerHeight;

      const scrollStart = vh;
      const sectionHeight = vh * SCROLL_HEIGHT_MULTIPLIER;
      
      const relativeScroll = Math.max(0, scrollTop - scrollStart);
      
      const currentSectionIndex = Math.floor(relativeScroll / sectionHeight);
      const sectionProgress = (relativeScroll % sectionHeight) / sectionHeight;
      const safeIndex = Math.min(currentSectionIndex, pathSegments.length - 1);
      
      if (safeIndex >= 0 && safeIndex < pathSegments.length) {
          const segment = pathSegments[safeIndex];
          const currentPos = getQuadraticBezierPoint(sectionProgress, segment.start, segment.control, segment.end);
          transportOverlay.setPosition(currentPos);
          map.panTo(currentPos);
          
          const iconDiv = transportOverlay.getContent();
          if(iconDiv) {
              const transportMode = segment.data.transportToNext;
              const iconChar = getTransportIcon(transportMode);
              if (iconDiv.innerText !== iconChar) {
                  iconDiv.innerText = iconChar;
              }

              if (transportMode === 'PLANE') {
                  const nextT = Math.min(sectionProgress + 0.1, 1);
                  const nextPos = getQuadraticBezierPoint(nextT, segment.start, segment.control, segment.end);
                  const dLat = nextPos.getLat() - currentPos.getLat();
                  const dLng = nextPos.getLng() - currentPos.getLng();
                  const angle = Math.atan2(dLat, dLng) * (180 / Math.PI);
                  iconDiv.style.transform = `translate(-50%, -50%) rotate(${45 - angle}deg)`;
              } else {
                  iconDiv.style.transform = `translate(-50%, -50%) rotate(0deg)`;
              }
          }

          const historyPath = pathSegments.slice(0, safeIndex).flatMap(s => s.curvePath);
          const currentPartialPath = generateCurvePath(segment.start, segment.end, segment.control, Math.floor(sectionProgress * 50));
          traveledPolyline.setPath([...historyPath, ...currentPartialPath]);

      } else if (currentSectionIndex >= pathSegments.length) {
          const lastPoint = sortedPoints[sortedPoints.length - 1];
          const pos = new window.kakao.maps.LatLng(lastPoint.lat, lastPoint.lng);
          transportOverlay.setPosition(pos);
          traveledPolyline.setPath(fullBackgroundPath);
      }

      sortedPoints.forEach((_, idx) => {
        const card = cardRefs.current[idx];
        if (!card) return;

        let localProgress = 0;
        if (currentSectionIndex === idx) localProgress = sectionProgress;
        else if (currentSectionIndex > idx) localProgress = 1; 
        else localProgress = 0; 

        let opacity = 0;
        let translateY = 0;
        let scale = 1;

        if (localProgress < 0.10) {
            opacity = localProgress / 0.10;
            translateY = 30 * (1 - opacity); 
            scale = 0.95 + (0.05 * opacity);
        } else if (localProgress < 0.85) {
            opacity = 1;
            translateY = 0;
            scale = 1;
        } else {
            const exitProgress = (localProgress - 0.85) / 0.15;
            opacity = 1 - exitProgress;
            translateY = -80 * exitProgress; 
            scale = 1 - (0.05 * exitProgress);
        }

        card.style.opacity = opacity.toString();
        card.style.transform = `translateY(${translateY}px) scale(${scale})`;
        card.style.visibility = opacity <= 0.01 ? 'hidden' : 'visible';
      });
    };

    const container = scrollContainerRef.current;
    if (container) {
      container.addEventListener('scroll', handleScroll);
      handleScroll(); 
    }
    return () => {
      if (container) {
        container.removeEventListener('scroll', handleScroll);
      }
    };
  }, [map, transportOverlay, traveledPolyline, pathSegments, fullBackgroundPath, sortedPoints]);


  return (
    <div className="fixed inset-0 z-50 bg-black font-sans">
      
      {/* Background Map Layer */}
      <div className="fixed inset-0 z-0 bg-black">
        <div 
            ref={mapRef} 
            className={`w-full h-full transition-all duration-700 ${mapType === 'HYBRID' ? 'opacity-70' : 'opacity-40 grayscale-[30%] contrast-125'}`} 
        />
        <div className="absolute inset-0 bg-gradient-to-b from-black/50 via-transparent to-black/80 pointer-events-none" />
      </div>

      <div id="youtube-player" className="hidden" />

      {/* Top Controls */}
      <div className="fixed top-6 right-6 z-50 flex gap-4 items-start">
          
          {trip.bgmType && trip.bgmType !== 'NONE' && (
              <div className="bg-black/40 hover:bg-black/60 backdrop-blur-md text-white p-2 rounded-full border border-white/20 shadow-lg flex items-center space-x-2 pr-4 transition-all">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center ${isPlaying ? 'bg-indigo-500 animate-pulse' : 'bg-gray-600'}`}>
                      <Music size={14} className={isPlaying ? 'animate-spin-slow' : ''} />
                  </div>
                  <div className="flex flex-col">
                      <span className="text-[10px] text-gray-300 uppercase tracking-wider font-bold">BGM</span>
                      <div className="flex items-center space-x-3">
                        <button onClick={togglePlay} className="hover:text-indigo-400 transition">
                            {isPlaying ? <Pause size={16} fill="currentColor"/> : <Play size={16} fill="currentColor"/>}
                        </button>
                        <button onClick={toggleMute} className="hover:text-indigo-400 transition">
                            {isMuted ? <VolumeX size={16}/> : <Volume2 size={16}/>}
                        </button>
                      </div>
                  </div>
              </div>
          )}

          <div className="flex flex-col gap-2">
            <button onClick={handleShareTrip} className="bg-black/40 hover:bg-black/60 backdrop-blur-md text-white p-3 rounded-full transition-all border border-white/20 shadow-lg group">
                <LinkIcon size={20} />
            </button>
            <button onClick={toggleMapType} className="bg-black/40 hover:bg-black/60 backdrop-blur-md text-white p-3 rounded-full transition-all border border-white/20 shadow-lg group">
                {mapType === 'ROADMAP' ? <Globe size={20} /> : <Layers size={20} />}
            </button>
            <button onClick={handleZoomIn} className="bg-black/40 hover:bg-black/60 backdrop-blur-md text-white p-3 rounded-full transition-all border border-white/20 shadow-lg group">
                <Plus size={20} />
            </button>
            <button onClick={handleZoomOut} className="bg-black/40 hover:bg-black/60 backdrop-blur-md text-white p-3 rounded-full transition-all border border-white/20 shadow-lg group">
                <Minus size={20} />
            </button>
            <button onClick={onClose} className="bg-black/40 hover:bg-black/60 backdrop-blur-md text-white p-3 rounded-full transition-all border border-white/20 shadow-lg group">
                <X size={20} className="group-hover:rotate-90 transition-transform" />
            </button>
          </div>
      </div>

      {/* Content Layer */}
      <div 
        ref={scrollContainerRef} 
        className="relative z-10 w-full h-full overflow-y-auto no-scrollbar scroll-smooth"
      >
        {/* Hero Section */}
        <div className="h-screen w-full flex flex-col justify-center items-center text-center p-8 text-white relative z-20 overflow-hidden">
          {/* Hero Background Image */}
          {trip.thumbnailUrl && (
              <div className="absolute inset-0 z-[-1]">
                  <img src={trip.thumbnailUrl} alt="Cover" className="w-full h-full object-cover opacity-60 blur-sm scale-110" />
                  <div className="absolute inset-0 bg-black/50" />
              </div>
          )}

          <div className="animate-fade-in-up max-w-4xl">
            <span className="inline-block px-4 py-1 rounded-full border border-white/30 bg-black/30 backdrop-blur-sm text-sm font-light mb-6 tracking-widest uppercase">
              TripFlow Journey
            </span>
            <h1 className="text-4xl md:text-6xl font-bold mb-6 leading-tight drop-shadow-2xl">
              {trip.title}
            </h1>
            <div className="flex items-center justify-center space-x-6 text-white/80 text-sm md:text-base font-light tracking-wide">
               <span className="flex items-center"><Clock size={16} className="mr-2"/> {new Date(trip.createdAt).toLocaleDateString()}</span>
               <span className="w-1 h-1 bg-white rounded-full"/>
               <span className="flex items-center"><MapPin size={16} className="mr-2"/> {sortedPoints.length} Checkpoints</span>
            </div>
          </div>
          
          <div className="absolute bottom-10 animate-bounce text-white/70">
            <div className="flex flex-col items-center gap-2">
                <span className="text-xs tracking-widest uppercase">Scroll to Start</span>
                <ArrowDown size={24} />
            </div>
          </div>
        </div>

        {/* Trip Points */}
        <div className="w-full">
            {sortedPoints.map((point, idx) => (
            <div 
                key={point.id} 
                style={{ height: `${SCROLL_HEIGHT_MULTIPLIER * 100}vh` }}
                className="w-full relative"
            >
                <div className="absolute top-0 bottom-0 left-1/2 w-px bg-gradient-to-b from-white/0 via-white/10 to-white/0 transform -translate-x-1/2" />

                <div className="sticky top-0 h-screen w-full flex items-center justify-center p-4 overflow-hidden">
                    <div 
                        ref={el => cardRefs.current[idx] = el}
                        className="w-full max-w-md bg-black/85 backdrop-blur-xl rounded-2xl shadow-2xl overflow-hidden border border-white/10 transform will-change-transform opacity-0"
                    >
                        <div className="relative h-48 md:h-56 overflow-hidden group">
                            <img 
                                src={point.photoUrl} 
                                alt={point.title} 
                                className="w-full h-full object-cover opacity-90 group-hover:opacity-100 transition-opacity" 
                            />
                            <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-transparent" />
                            <div className="absolute top-3 left-3">
                                <span className="bg-indigo-600 text-white px-2 py-0.5 rounded-full text-xs font-bold border border-white/20 shadow-lg">
                                    STEP {idx + 1}
                                </span>
                            </div>
                            <div className="absolute bottom-0 left-0 p-5 text-white w-full">
                                <div className="flex items-center text-xs font-bold tracking-wider uppercase mb-1 text-indigo-300">
                                    <Clock size={12} className="mr-1" />
                                    {point.date.replace('T', ' ')}
                                </div>
                                <h2 className="text-xl md:text-2xl font-bold leading-tight text-white drop-shadow-md truncate">{point.title}</h2>
                            </div>
                        </div>

                        <div className="p-5 text-gray-200">
                            <div className="flex items-start mb-4">
                                <div className="bg-indigo-500/20 p-1.5 rounded-full mr-3 text-indigo-400 shrink-0 border border-indigo-500/30">
                                    <MapPin size={16} />
                                </div>
                                <div>
                                    <h3 className="text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-0.5">Location</h3>
                                    <p className="text-base font-bold text-white leading-none mb-0.5">{point.locationName}</p>
                                    <p className="text-xs text-gray-400 truncate max-w-[200px]">{point.address}</p>
                                </div>
                            </div>
                            <div className="prose prose-invert max-w-none mb-4">
                                <p className="text-gray-300 leading-relaxed text-sm md:text-base whitespace-pre-line line-clamp-4">
                                    {point.description}
                                </p>
                            </div>
                            {idx < sortedPoints.length - 1 && (
                                <div className="border-t border-white/10 pt-3 flex items-center justify-between">
                                    <div className="flex items-center text-gray-500 text-xs font-medium">
                                        <Navigation size={12} className="mr-1" />
                                        <span>Next Destination</span>
                                    </div>
                                    <div className="flex items-center bg-indigo-900/30 text-indigo-300 px-2 py-1 rounded-full text-xs font-bold border border-indigo-500/30">
                                        <span className="mr-1">{getTransportIcon(point.transportToNext)}</span>
                                        <span>{getTransportLabel(point.transportToNext)}</span>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
            ))}
        </div>

        {/* Outro */}
        <div className="min-h-screen flex flex-col justify-start items-center text-white p-4 pt-20 bg-gradient-to-t from-black via-black/90 to-transparent relative z-20 pb-20">
            <h2 className="text-3xl font-bold mb-4 drop-shadow-lg">End of Journey</h2>
            
            <div className="flex space-x-3 mb-10">
                <button 
                    onClick={() => {
                        if(scrollContainerRef.current) scrollContainerRef.current.scrollTo({top: 0, behavior: 'smooth'});
                    }}
                    className="px-5 py-2 bg-white/10 hover:bg-white/20 backdrop-blur-md text-white rounded-full text-sm font-semibold transition border border-white/30"
                >
                    다시 보기
                </button>
                <button 
                    onClick={onClose}
                    className="px-6 py-2 bg-white text-black rounded-full text-sm font-bold hover:bg-gray-200 transition shadow-xl"
                >
                    지도 닫기
                </button>
            </div>

            {/* Review Section */}
            <div className="w-full max-w-md bg-white/5 backdrop-blur-xl rounded-2xl p-6 border border-white/10">
                <h3 className="text-xl font-bold mb-4 flex items-center">
                    <Star className="text-yellow-400 mr-2" fill="currentColor" size={20} /> 
                    여행자 리뷰 <span className="text-xs font-normal text-white/60 ml-2">({reviews.length})</span>
                </h3>

                {auth.currentUser ? (
                    <div className="mb-6 p-4 bg-white/5 rounded-xl border border-white/5">
                        <div className="flex items-center justify-between mb-3">
                            <span className="font-medium text-white/90 text-sm">별점 남기기</span>
                            <div className="flex space-x-1">
                                {[1, 2, 3, 4, 5].map((star) => (
                                    <button key={star} onClick={() => setNewRating(star)} className="focus:outline-none transition-transform hover:scale-110">
                                        <Star 
                                            size={20} 
                                            className={star <= newRating ? "text-yellow-400" : "text-gray-600"} 
                                            fill={star <= newRating ? "currentColor" : "currentColor"}
                                        />
                                    </button>
                                ))}
                            </div>
                        </div>
                        <div className="flex gap-2">
                            <input 
                                type="text" 
                                value={newComment}
                                onChange={(e) => setNewComment(e.target.value)}
                                placeholder="감상평을 남겨주세요..."
                                className="flex-1 bg-white/10 border-transparent focus:border-indigo-500 focus:bg-white/20 text-white placeholder-gray-400 rounded-lg px-3 py-2 text-sm transition outline-none"
                                onKeyDown={(e) => e.key === 'Enter' && handleSubmitReview()}
                            />
                            <button onClick={handleSubmitReview} disabled={isSubmittingReview} className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg px-3 py-2 font-bold disabled:opacity-50 transition">
                                <Send size={16} />
                            </button>
                        </div>
                    </div>
                ) : (
                    <div className="mb-6 p-4 bg-indigo-900/30 rounded-xl border border-indigo-500/30 text-center">
                        <p className="text-sm text-indigo-200 mb-2">여행에 대한 감상을 남기고 싶으신가요?</p>
                        <button onClick={() => alert('상단 메뉴에서 로그인해주세요!')} className="text-xs font-bold bg-white text-indigo-600 px-3 py-1.5 rounded-full hover:bg-gray-100 transition">
                            로그인하고 리뷰 쓰기
                        </button>
                    </div>
                )}

                <div className="space-y-3 overflow-y-auto max-h-64 no-scrollbar pr-1">
                    {reviews.length === 0 ? (
                        <p className="text-center text-white/50 py-4 text-xs">아직 작성된 리뷰가 없습니다.</p>
                    ) : (
                        reviews.map((review) => (
                            <div key={review.id} className="bg-black/40 p-3 rounded-lg border border-white/5 relative group">
                                <div className="flex justify-between items-start mb-1">
                                    <div className="flex items-center">
                                        <div className="w-6 h-6 rounded-full bg-indigo-500 flex items-center justify-center text-xs font-bold mr-2 overflow-hidden border border-white/20">
                                            {review.userPhoto ? <img src={review.userPhoto} alt="user" className="w-full h-full object-cover"/> : review.userName[0]}
                                        </div>
                                        <div>
                                            <div className="font-bold text-xs text-white">{review.userName}</div>
                                            {editingReviewId === review.id ? (
                                                <div className="flex items-center space-x-1 mt-1">
                                                     {[1, 2, 3, 4, 5].map((star) => (
                                                        <button key={star} onClick={() => setEditReviewRating(star)} className="focus:outline-none">
                                                            <Star size={10} className={star <= editReviewRating ? "text-yellow-400" : "text-gray-600"} fill={star <= editReviewRating ? "currentColor" : "currentColor"}/>
                                                        </button>
                                                     ))}
                                                </div>
                                            ) : (
                                                <div className="flex items-center text-yellow-400">
                                                    {[...Array(review.rating)].map((_, i) => <Star key={i} size={8} fill="currentColor" />)}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                    <span className="text-[10px] text-white/40">{new Date(review.createdAt).toLocaleDateString()}</span>
                                </div>
                                {editingReviewId === review.id ? (
                                    <div className="mt-2">
                                        <input 
                                            type="text" 
                                            value={editReviewText}
                                            onChange={(e) => setEditReviewText(e.target.value)}
                                            className="w-full bg-white/10 text-white text-xs p-2 rounded mb-2 border border-white/20 focus:outline-none"
                                            autoFocus
                                        />
                                        <div className="flex justify-end gap-2">
                                            <button onClick={cancelEditing} className="p-1 text-gray-400 hover:text-white rounded bg-white/10"><X size={12} /></button>
                                            <button onClick={() => handleUpdateReview(review.id)} className="p-1 text-green-400 hover:text-green-300 rounded bg-green-500/20 border border-green-500/30"><Check size={12} /></button>
                                        </div>
                                    </div>
                                ) : (
                                    <p className="text-white/80 text-xs ml-8 leading-snug">{review.text}</p>
                                )}
                                {auth.currentUser?.uid === review.userId && editingReviewId !== review.id && (
                                    <div className="absolute top-2 right-2 flex space-x-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <button onClick={() => startEditing(review)} className="p-1 text-gray-400 hover:text-indigo-400 bg-black/50 rounded" title="수정"><Pencil size={10} /></button>
                                        <button onClick={() => handleDeleteReview(review.id)} className="p-1 text-gray-400 hover:text-red-400 bg-black/50 rounded" title="삭제"><Trash2 size={10} /></button>
                                    </div>
                                )}
                            </div>
                        ))
                    )}
                </div>
            </div>
        </div>
      </div>
    </div>
  );
};

export default TripViewer;