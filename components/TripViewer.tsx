import React, { useEffect, useRef, useState, useMemo } from 'react';
import { TripData, TransportType, Review } from '../types';
import { MapPin, ArrowDown, X, Clock, Navigation, Star, Send } from 'lucide-react';
import { db, auth } from '../firebase';
import { collection, addDoc, query, where, onSnapshot, orderBy } from 'firebase/firestore';

interface TripViewerProps {
  trip: TripData;
  onClose: () => void;
}

// Increased multiplier for slower, more comfortable scrolling (5 screens per point)
const SCROLL_HEIGHT_MULTIPLIER = 5;

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
  const [map, setMap] = useState<any>(null);
  const [transportOverlay, setTransportOverlay] = useState<any>(null);

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
    if(!trip.id || !newComment.trim()) return;
    if(!auth.currentUser) {
        alert("로그인이 필요합니다.");
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
    } catch (e) {
        console.error(e);
        alert('리뷰 작성 중 오류가 발생했습니다.');
    } finally {
        setIsSubmittingReview(false);
    }
  };

  // 1. Initialize Map
  useEffect(() => {
    if (!mapRef.current || pathPoints.length === 0) return;

    const options = {
      center: pathPoints[0].latlng,
      level: 5,
      draggable: false, 
      zoomable: false,
      scrollwheel: false,
      disableDoubleClickZoom: true
    };
    const newMap = new window.kakao.maps.Map(mapRef.current, options);
    setMap(newMap);

    const path = pathPoints.map(p => p.latlng);
    const polyline = new window.kakao.maps.Polyline({
      path: path,
      strokeWeight: 8,
      strokeColor: '#FFFFFF', 
      strokeOpacity: 0.6,
      strokeStyle: 'solid'
    });
    polyline.setMap(newMap);

    pathPoints.forEach((p, index) => {
      const markerContent = document.createElement('div');
      markerContent.innerHTML = `
        <div style="
          width: 14px; 
          height: 14px; 
          background: white; 
          border-radius: 50%; 
          box-shadow: 0 0 10px rgba(255,255,255,0.9);
          border: 3px solid #4F46E5;
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

    const transportContent = document.createElement('div');
    transportContent.className = 'transport-icon text-5xl filter drop-shadow-2xl transition-all duration-300 transform -translate-x-1/2 -translate-y-1/2';
    transportContent.style.textShadow = '0 4px 8px rgba(0,0,0,0.5)';
    transportContent.innerText = getTransportIcon(trip.points[0].transportToNext);

    const overlay = new window.kakao.maps.CustomOverlay({
      position: pathPoints[0].latlng,
      content: transportContent,
      zIndex: 100
    });
    overlay.setMap(newMap);
    setTransportOverlay(overlay);

  }, [pathPoints, trip]);

  // 2. Handle Scroll Logic
  useEffect(() => {
    const handleScroll = () => {
      if (!scrollContainerRef.current || !map || !transportOverlay || pathPoints.length < 2) return;

      const container = scrollContainerRef.current;
      const scrollTop = container.scrollTop;
      const vh = window.innerHeight;

      // Calculate progress relative to the content sections
      // We subtract the initial Hero section (vh)
      // Each segment is SCROLL_HEIGHT_MULTIPLIER * vh long
      const sectionHeight = vh * SCROLL_HEIGHT_MULTIPLIER;
      const rawProgress = (scrollTop - vh) / sectionHeight;
      const maxIndex = pathPoints.length - 1;
      
      // 1. Move Marker Logic
      const progress = Math.min(Math.max(rawProgress, 0), maxIndex);
      const index = Math.floor(progress);
      const segmentProgress = progress - index;

      if (index >= maxIndex) {
         const lastPos = pathPoints[maxIndex].latlng;
         transportOverlay.setPosition(lastPos);
         map.panTo(lastPos);
      } else {
        const start = pathPoints[index].latlng;
        const end = pathPoints[index + 1].latlng;
        
        const currentLat = start.getLat() + (end.getLat() - start.getLat()) * segmentProgress;
        const currentLng = start.getLng() + (end.getLng() - start.getLng()) * segmentProgress;
        const currentPos = new window.kakao.maps.LatLng(currentLat, currentLng);

        transportOverlay.setPosition(currentPos);
        map.panTo(currentPos);
        
        const iconDiv = transportOverlay.getContent();
        if(iconDiv) {
          const nextTransport = trip.points[index].transportToNext;
          if (iconDiv.innerText !== getTransportIcon(nextTransport)) {
              iconDiv.innerText = getTransportIcon(nextTransport);
          }
        }
      }

      // 2. Animate Cards Opacity (Direct DOM manipulation for performance)
      trip.points.forEach((_, idx) => {
        const card = document.getElementById(`trip-card-${idx}`);
        if (card) {
          // Calculate distance from the 'perfect' center point of this segment
          const distance = Math.abs(rawProgress - idx);
          
          // Fade out as we move away.
          // 0 distance = 1 opacity
          // > 0.3 distance = 0 opacity (fades out quickly to show map)
          let opacity = Math.max(0, 1 - distance * 3);
          
          // Apply styles
          card.style.opacity = opacity.toString();
          // Slight scale and translate effect
          const scale = 0.9 + (0.1 * opacity);
          const translateY = 30 * (1 - opacity);
          card.style.transform = `scale(${scale}) translateY(${translateY}px)`;
          
          // Disable pointer events if not visible to prevent accidental clicks
          card.style.pointerEvents = opacity > 0.5 ? 'auto' : 'none';
        }
      });
    };

    const container = scrollContainerRef.current;
    if (container) {
      container.addEventListener('scroll', handleScroll);
      // Trigger once on mount
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
      <div className="fixed inset-0 z-0">
        <div ref={mapRef} className="w-full h-full" />
        <div className="absolute inset-0 bg-black/40 pointer-events-none backdrop-blur-[1px]" />
      </div>

      {/* 2. Controls */}
      <button 
        onClick={onClose}
        className="fixed top-6 right-6 z-50 bg-black/20 hover:bg-black/40 backdrop-blur-md text-white p-2 rounded-full transition-all border border-white/30 group"
      >
        <X size={24} className="group-hover:rotate-90 transition-transform" />
      </button>

      {/* 3. Scrollable Content Layer */}
      <div 
        ref={scrollContainerRef} 
        className="relative z-10 w-full h-full overflow-y-auto no-scrollbar scroll-smooth"
      >
        {/* Hero Section */}
        <div className="h-screen w-full flex flex-col justify-center items-center text-center p-8 text-white relative z-20 pointer-events-none">
          <div className="animate-fade-in-up max-w-4xl pointer-events-auto">
            <span className="inline-block px-4 py-1 rounded-full border border-white/30 bg-black/30 backdrop-blur-sm text-sm font-light mb-6 tracking-widest uppercase">
              TripFlow Journey
            </span>
            <h1 className="text-5xl md:text-7xl font-bold mb-6 leading-tight drop-shadow-lg">
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
        <div className="w-full pb-[50vh]">
            {trip.points.map((point, idx) => (
            // Each section is much taller than screen to allow for travel time
            <div 
                key={point.id} 
                style={{ height: `${SCROLL_HEIGHT_MULTIPLIER * 100}vh` }}
                className="w-full relative"
            >
                {/* Sticky card that stays in view while we travel through this section */}
                <div className="sticky top-0 h-screen w-full flex items-center justify-center p-4 md:p-8 overflow-hidden">
                    
                    {/* Visual Connector Line */}
                    {idx < trip.points.length - 1 && (
                        <div className="absolute bottom-0 left-1/2 w-px h-1/2 bg-gradient-to-b from-white/0 to-white/30 transform -translate-x-1/2 hidden md:block" />
                    )}

                    {/* Card Container */}
                    <div 
                        id={`trip-card-${idx}`}
                        className="w-full max-w-2xl bg-white/90 backdrop-blur-2xl rounded-3xl shadow-2xl overflow-hidden border border-white/40 transition-transform duration-100 ease-out origin-center"
                        style={{ opacity: 0 }} // Initial state handled by JS
                    >
                        <div className="relative h-64 md:h-80 overflow-hidden group">
                            <img 
                                src={point.photoUrl} 
                                alt={point.title} 
                                className="w-full h-full object-cover transition-transform duration-1000 group-hover:scale-105" 
                            />
                            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
                            
                            <div className="absolute top-4 left-4">
                                <span className="bg-black/40 backdrop-blur-md text-white px-3 py-1 rounded-full text-xs font-bold border border-white/20 shadow-lg">
                                    #{idx + 1} CHECKPOINT
                                </span>
                            </div>

                            <div className="absolute bottom-0 left-0 p-6 text-white w-full">
                                <div className="flex items-center text-xs font-medium tracking-wider uppercase mb-1 text-indigo-300">
                                    <Clock size={12} className="mr-1" />
                                    {point.date.replace('T', ' ')}
                                </div>
                                <h2 className="text-3xl font-bold leading-tight text-white drop-shadow-md">{point.title}</h2>
                            </div>
                        </div>

                        <div className="p-6 md:p-8">
                            <div className="flex items-start mb-6">
                                <div className="bg-indigo-100 p-2 rounded-full mr-4 text-indigo-600">
                                    <MapPin size={20} />
                                </div>
                                <div>
                                    <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-1">Current Location</h3>
                                    <p className="text-lg font-bold text-gray-900 leading-none mb-1">{point.locationName}</p>
                                    <p className="text-sm text-gray-500">{point.address}</p>
                                </div>
                            </div>

                            <div className="prose prose-indigo max-w-none mb-8">
                                <p className="text-gray-700 leading-relaxed text-lg whitespace-pre-line">
                                    {point.description}
                                </p>
                            </div>

                            {idx < trip.points.length - 1 && (
                                <div className="border-t border-gray-200 pt-5 flex items-center justify-between">
                                    <div className="flex items-center text-gray-500 text-sm font-medium">
                                        <Navigation size={16} className="mr-2" />
                                        <span>Next Destination</span>
                                    </div>
                                    <div className="flex items-center bg-gradient-to-r from-indigo-600 to-purple-600 text-white px-4 py-2 rounded-full text-sm font-bold shadow-lg">
                                        <span className="mr-2 text-lg">{getTransportIcon(point.transportToNext)}</span>
                                        <span>{getTransportLabel(point.transportToNext)}로 이동</span>
                                    </div>
                                </div>
                            )}
                            {idx === trip.points.length - 1 && (
                                 <div className="border-t border-gray-200 pt-5 flex items-center justify-center text-indigo-600 font-bold">
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
        <div className="h-[80vh] flex flex-col justify-center items-center text-white p-8 bg-gradient-to-t from-black via-black/80 to-transparent">
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

             {/* Review & Ratings Section inside Outro */}
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