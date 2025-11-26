import React, { useEffect, useRef, useState, useMemo } from 'react';
import { TripData, TransportType, Review } from '../types';
import { MapPin, ArrowDown, X, Clock, Navigation, Star, Send, Globe, Layers } from 'lucide-react';
import { db, auth } from '../firebase';
import { collection, addDoc, query, where, onSnapshot, orderBy } from 'firebase/firestore';

interface TripViewerProps {
  trip: TripData;
  onClose: () => void;
}

// Reduced multiplier for immediate snappy scrolling
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

const TripViewer: React.FC<TripViewerProps> = ({ trip, onClose }) => {
  const mapRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [map, setMap] = useState<any>(null);
  const [transportOverlay, setTransportOverlay] = useState<any>(null);
  const [mapType, setMapType] = useState<'ROADMAP' | 'HYBRID'>('ROADMAP');

  // Review State
  const [reviews, setReviews] = useState<Review[]>([]);
  const [newRating, setNewRating] = useState(5);
  const [newComment, setNewComment] = useState('');
  const [isSubmittingReview, setIsSubmittingReview] = useState(false);

  // Memoize path points
  const pathPoints = useMemo(() => {
    if (!window.kakao || !window.kakao.maps) return [];
    return trip.points.map(p => ({
      latlng: new window.kakao.maps.LatLng(p.lat, p.lng),
      data: p
    }));
  }, [trip]);

  // Fetch Reviews
  useEffect(() => {
    if(!trip.id) return;
    const q = query(
        collection(db, 'reviews'), 
        where('tripId', '==', trip.id),
        orderBy('createdAt', 'desc')
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
        const fetchedReviews: Review[] = [];
        snapshot.forEach(doc => fetchedReviews.push({ id: doc.id, ...doc.data() } as Review));
        setReviews(fetchedReviews);
    });
    return unsubscribe;
  }, [trip.id]);

  // Submit Review
  const handleSubmitReview = async () => {
    if (!auth.currentUser) {
        alert("로그인이 필요한 기능입니다.");
        return;
    }
    if (!trip.id) {
        alert("여행 정보 오류: ID를 찾을 수 없습니다.");
        return;
    }
    if (!newComment.trim()) {
        alert("리뷰 내용을 입력해주세요.");
        return;
    }
    
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

  // Toggle Map Type
  const toggleMapType = () => {
    if (!map || !window.kakao) return;
    const nextType = mapType === 'ROADMAP' ? 'HYBRID' : 'ROADMAP';
    setMapType(nextType);
    map.setMapTypeId(window.kakao.maps.MapTypeId[nextType]);
  };

  // 1. Initialize Map
  useEffect(() => {
    if (!mapRef.current || pathPoints.length === 0) return;

    // Use Level 9 for "Vehicle moving" feel (Zoomed out)
    const options = {
      center: pathPoints[0].latlng,
      level: 9, 
      draggable: false, 
      zoomable: false,
      scrollwheel: false,
      disableDoubleClickZoom: true,
      mapTypeId: mapType === 'HYBRID' ? window.kakao.maps.MapTypeId.HYBRID : window.kakao.maps.MapTypeId.ROADMAP
    };
    const newMap = new window.kakao.maps.Map(mapRef.current, options);
    setMap(newMap);

    const path = pathPoints.map(p => p.latlng);
    const polyline = new window.kakao.maps.Polyline({
      path: path,
      strokeWeight: 6,
      strokeColor: '#FFFFFF', 
      strokeOpacity: 0.8,
      strokeStyle: 'solid'
    });
    polyline.setMap(newMap);

    // Add Checkpoint Markers
    pathPoints.forEach((p, index) => {
      const markerContent = document.createElement('div');
      markerContent.innerHTML = `
        <div style="
          width: 12px; 
          height: 12px; 
          background: white; 
          border-radius: 50%; 
          box-shadow: 0 0 8px rgba(255,255,255,0.8);
          border: 2px solid #4F46E5;
        "></div>
      `;
      const customOverlay = new window.kakao.maps.CustomOverlay({
        position: p.latlng,
        content: markerContent,
        yAnchor: 0.5,
        zIndex: 10
      });
      customOverlay.setMap(newMap);
    });

    // Transport/Vehicle Marker
    const transportContent = document.createElement('div');
    transportContent.className = 'transport-icon text-4xl filter drop-shadow-2xl transition-all duration-300 transform -translate-x-1/2 -translate-y-1/2';
    transportContent.style.textShadow = '0 4px 8px rgba(0,0,0,0.5)';
    transportContent.innerText = getTransportIcon(trip.points[0].transportToNext);

    const overlay = new window.kakao.maps.CustomOverlay({
      position: pathPoints[0].latlng,
      content: transportContent,
      zIndex: 100
    });
    overlay.setMap(newMap);
    setTransportOverlay(overlay);

  }, [pathPoints, trip]); // Re-init if trip changes (Map type toggle handled separately via state/button)

  // 2. Handle Scroll Logic (Sticky & Animation)
  useEffect(() => {
    const handleScroll = () => {
      if (!scrollContainerRef.current || !map || !transportOverlay || pathPoints.length < 2) return;

      const container = scrollContainerRef.current;
      const scrollTop = container.scrollTop;
      const vh = window.innerHeight;

      const scrollStart = vh;
      const sectionHeight = vh * SCROLL_HEIGHT_MULTIPLIER;
      
      const relativeScroll = Math.max(0, scrollTop - scrollStart);
      const totalIndex = pathPoints.length;
      
      const currentSectionIndex = Math.floor(relativeScroll / sectionHeight);
      const sectionProgress = (relativeScroll % sectionHeight) / sectionHeight;
      
      let mapProgress = relativeScroll / sectionHeight;
      
      if (mapProgress < 0) mapProgress = 0;
      if (mapProgress > totalIndex - 1) mapProgress = totalIndex - 1;

      // Move Marker
      const currentIndex = Math.floor(mapProgress);
      const currentSegmentProgress = mapProgress - currentIndex;

      if (currentIndex < pathPoints.length - 1) {
        const start = pathPoints[currentIndex].latlng;
        const end = pathPoints[currentIndex + 1].latlng;
        
        const currentLat = start.getLat() + (end.getLat() - start.getLat()) * currentSegmentProgress;
        const currentLng = start.getLng() + (end.getLng() - start.getLng()) * currentSegmentProgress;
        const currentPos = new window.kakao.maps.LatLng(currentLat, currentLng);

        transportOverlay.setPosition(currentPos);
        map.panTo(currentPos);
        
        const iconDiv = transportOverlay.getContent();
        if(iconDiv) {
          const nextTransport = trip.points[currentIndex].transportToNext;
          if (iconDiv.innerText !== getTransportIcon(nextTransport)) {
              iconDiv.innerText = getTransportIcon(nextTransport);
          }
        }
      }

      // Card Animation
      trip.points.forEach((_, idx) => {
        const card = cardRefs.current[idx];
        if (!card) return;

        let localProgress = 0;
        
        if (currentSectionIndex === idx) {
             localProgress = sectionProgress;
        } else if (currentSectionIndex > idx) {
             localProgress = 1; 
        } else {
             localProgress = 0; 
        }

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
  }, [map, transportOverlay, pathPoints, trip]);


  return (
    <div className="fixed inset-0 z-50 bg-black font-sans">
      
      {/* 1. Background Map Layer */}
      {/* We use a black container and set map opacity to create a dark background effect */}
      <div className="fixed inset-0 z-0 bg-black">
        <div 
            ref={mapRef} 
            className={`w-full h-full transition-all duration-700 ${mapType === 'HYBRID' ? 'opacity-70' : 'opacity-40 grayscale-[30%] contrast-125'}`} 
        />
        {/* Additional gradient overlay for better text readability */}
        <div className="absolute inset-0 bg-gradient-to-b from-black/50 via-transparent to-black/80 pointer-events-none" />
      </div>

      {/* 2. Top Controls */}
      <div className="fixed top-6 right-6 z-50 flex gap-4">
          <button 
            onClick={toggleMapType}
            className="bg-black/40 hover:bg-black/60 backdrop-blur-md text-white p-3 rounded-full transition-all border border-white/20 shadow-lg group"
            title={mapType === 'ROADMAP' ? "위성지도로 보기" : "일반지도로 보기"}
          >
            {mapType === 'ROADMAP' ? <Globe size={20} /> : <Layers size={20} />}
          </button>

          <button 
            onClick={onClose}
            className="bg-black/40 hover:bg-black/60 backdrop-blur-md text-white p-3 rounded-full transition-all border border-white/20 shadow-lg group"
          >
            <X size={20} className="group-hover:rotate-90 transition-transform" />
          </button>
      </div>

      {/* 3. Scrollable Content Layer */}
      <div 
        ref={scrollContainerRef} 
        className="relative z-10 w-full h-full overflow-y-auto no-scrollbar scroll-smooth"
      >
        {/* Hero Section */}
        <div className="h-screen w-full flex flex-col justify-center items-center text-center p-8 text-white relative z-20">
          <div className="animate-fade-in-up max-w-4xl">
            <span className="inline-block px-4 py-1 rounded-full border border-white/30 bg-black/30 backdrop-blur-sm text-sm font-light mb-6 tracking-widest uppercase">
              TripFlow Journey
            </span>
            <h1 className="text-5xl md:text-7xl font-bold mb-6 leading-tight drop-shadow-2xl">
              {trip.title}
            </h1>
            <div className="flex items-center justify-center space-x-6 text-white/80 text-sm md:text-base font-light tracking-wide">
               <span className="flex items-center"><Clock size={16} className="mr-2"/> {new Date(trip.createdAt).toLocaleDateString()}</span>
               <span className="w-1 h-1 bg-white rounded-full"/>
               <span className="flex items-center"><MapPin size={16} className="mr-2"/> {trip.points.length} Checkpoints</span>
            </div>
          </div>
          
          <div className="absolute bottom-10 animate-bounce text-white/70">
            <div className="flex flex-col items-center gap-2">
                <span className="text-xs tracking-widest uppercase">Scroll to Start</span>
                <ArrowDown size={24} />
            </div>
          </div>
        </div>

        {/* Trip Points Stream */}
        <div className="w-full">
            {trip.points.map((point, idx) => (
            <div 
                key={point.id} 
                style={{ height: `${SCROLL_HEIGHT_MULTIPLIER * 100}vh` }}
                className="w-full relative"
            >
                {/* Connecting Line Visual */}
                <div className="absolute top-0 bottom-0 left-1/2 w-px bg-gradient-to-b from-white/0 via-white/10 to-white/0 transform -translate-x-1/2" />

                <div className="sticky top-0 h-screen w-full flex items-center justify-center p-4 md:p-8 overflow-hidden">
                    <div 
                        ref={el => cardRefs.current[idx] = el}
                        className="w-full max-w-2xl bg-black/80 backdrop-blur-xl rounded-3xl shadow-2xl overflow-hidden border border-white/10 transform will-change-transform opacity-0"
                    >
                        <div className="relative h-56 md:h-72 overflow-hidden group">
                            <img 
                                src={point.photoUrl} 
                                alt={point.title} 
                                className="w-full h-full object-cover opacity-90 group-hover:opacity-100 transition-opacity" 
                            />
                            <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-transparent" />
                            
                            <div className="absolute top-4 left-4">
                                <span className="bg-black/50 backdrop-blur-md text-white px-3 py-1 rounded-full text-xs font-bold border border-white/10 shadow-lg">
                                    #{idx + 1} CHECKPOINT
                                </span>
                            </div>

                            <div className="absolute bottom-0 left-0 p-6 text-white w-full">
                                <div className="flex items-center text-xs font-medium tracking-wider uppercase mb-1 text-indigo-300">
                                    <Clock size={12} className="mr-1" />
                                    {point.date.replace('T', ' ')}
                                </div>
                                <h2 className="text-2xl md:text-3xl font-bold leading-tight text-white drop-shadow-md">{point.title}</h2>
                            </div>
                        </div>

                        <div className="p-6 md:p-8 text-gray-200">
                            <div className="flex items-start mb-6">
                                <div className="bg-indigo-500/20 p-2 rounded-full mr-4 text-indigo-400 shrink-0 border border-indigo-500/30">
                                    <MapPin size={20} />
                                </div>
                                <div>
                                    <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-1">Location</h3>
                                    <p className="text-lg font-bold text-white leading-none mb-1">{point.locationName}</p>
                                    <p className="text-sm text-gray-400">{point.address}</p>
                                </div>
                            </div>

                            <div className="prose prose-invert max-w-none mb-6">
                                <p className="text-gray-300 leading-relaxed text-base md:text-lg whitespace-pre-line line-clamp-4 md:line-clamp-none">
                                    {point.description}
                                </p>
                            </div>

                            {idx < trip.points.length - 1 && (
                                <div className="border-t border-white/10 pt-4 flex items-center justify-between">
                                    <div className="flex items-center text-gray-500 text-sm font-medium">
                                        <Navigation size={16} className="mr-2" />
                                        <span>Next Destination</span>
                                    </div>
                                    <div className="flex items-center bg-indigo-900/30 text-indigo-300 px-3 py-1.5 rounded-full text-sm font-bold border border-indigo-500/30">
                                        <span className="mr-2">{getTransportIcon(point.transportToNext)}</span>
                                        <span>{getTransportLabel(point.transportToNext)}</span>
                                    </div>
                                </div>
                            )}
                             {idx === trip.points.length - 1 && (
                                 <div className="border-t border-white/10 pt-4 flex items-center justify-center text-indigo-400 font-bold">
                                    🏁 여행 종료
                                 </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
            ))}
        </div>

        {/* Outro Section */}
        <div className="h-[80vh] flex flex-col justify-center items-center text-white p-8 bg-gradient-to-t from-black via-black/90 to-transparent relative z-20">
            <h2 className="text-4xl font-bold mb-6 drop-shadow-lg">End of Journey</h2>
            <div className="flex space-x-4 mb-12">
                <button 
                    onClick={() => {
                        if(scrollContainerRef.current) scrollContainerRef.current.scrollTo({top: 0, behavior: 'smooth'});
                    }}
                    className="px-6 py-3 bg-white/10 hover:bg-white/20 backdrop-blur-md text-white rounded-full font-semibold transition border border-white/30"
                >
                    다시 보기
                </button>
                <button 
                    onClick={onClose}
                    className="px-8 py-3 bg-white text-black rounded-full font-bold hover:bg-gray-200 transition shadow-xl"
                >
                    지도 닫기
                </button>
            </div>

             {/* Review & Ratings Section */}
            <div className="w-full max-w-3xl bg-white/5 backdrop-blur-xl rounded-3xl p-8 border border-white/10">
                <h3 className="text-2xl font-bold mb-6 flex items-center">
                    <Star className="text-yellow-400 mr-2" fill="currentColor" /> 
                    여행자 리뷰 <span className="text-sm font-normal text-white/60 ml-2">({reviews.length})</span>
                </h3>

                {/* Write Review */}
                <div className="mb-8 p-6 bg-white/5 rounded-2xl border border-white/5">
                    <div className="flex items-center mb-4">
                        <span className="mr-3 font-medium text-white/90">이 여행 어떠셨나요?</span>
                        <div className="flex space-x-1">
                            {[1, 2, 3, 4, 5].map((star) => (
                                <button key={star} onClick={() => setNewRating(star)} className="focus:outline-none transition-transform hover:scale-110">
                                    <Star 
                                        size={24} 
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
                            placeholder="여행에 대한 감상평을 남겨주세요..."
                            className="flex-1 bg-white/10 border-transparent focus:border-indigo-500 focus:bg-white/20 text-white placeholder-gray-400 rounded-lg px-4 py-2 transition outline-none"
                            onKeyDown={(e) => e.key === 'Enter' && handleSubmitReview()}
                        />
                        <button 
                            onClick={handleSubmitReview}
                            disabled={isSubmittingReview}
                            className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg px-6 py-2 font-bold disabled:opacity-50 transition"
                        >
                            <Send size={18} />
                        </button>
                    </div>
                </div>

                {/* Review List */}
                <div className="space-y-4 max-h-[400px] overflow-y-auto no-scrollbar pr-2">
                    {reviews.length === 0 ? (
                        <p className="text-center text-white/50 py-4">아직 작성된 리뷰가 없습니다. 첫 번째 리뷰를 남겨보세요!</p>
                    ) : (
                        reviews.map((review) => (
                            <div key={review.id} className="bg-black/40 p-4 rounded-xl border border-white/5">
                                <div className="flex justify-between items-start mb-2">
                                    <div className="flex items-center">
                                        <div className="w-8 h-8 rounded-full bg-indigo-500 flex items-center justify-center text-sm font-bold mr-3 overflow-hidden border border-white/20">
                                            {review.userPhoto ? <img src={review.userPhoto} alt="user" className="w-full h-full object-cover"/> : review.userName[0]}
                                        </div>
                                        <div>
                                            <div className="font-bold text-sm text-white">{review.userName}</div>
                                            <div className="flex items-center text-xs text-yellow-400">
                                                {[...Array(review.rating)].map((_, i) => <Star key={i} size={10} fill="currentColor" />)}
                                            </div>
                                        </div>
                                    </div>
                                    <span className="text-xs text-white/40">{new Date(review.createdAt).toLocaleDateString()}</span>
                                </div>
                                <p className="text-white/80 text-sm ml-11">{review.text}</p>
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