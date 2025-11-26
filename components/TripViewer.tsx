import React, { useEffect, useRef, useState, useMemo } from 'react';
import { TripData, TransportType, Review } from '../types';
import { MapPin, ArrowDown, X, Clock, Navigation, Star, Send } from 'lucide-react';
import { db, auth } from '../firebase';
import { collection, addDoc, query, where, onSnapshot, orderBy } from 'firebase/firestore';

interface TripViewerProps {
  trip: TripData;
  onClose: () => void;
}

// Reduced multiplier to 1.5 for much faster scrolling pace
const SCROLL_HEIGHT_MULTIPLIER = 1.5;

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

  // 2. Handle Scroll Logic (Sticky & Animation)
  useEffect(() => {
    const handleScroll = () => {
      if (!scrollContainerRef.current || !map || !transportOverlay || pathPoints.length < 2) return;

      const container = scrollContainerRef.current;
      const scrollTop = container.scrollTop;
      const vh = window.innerHeight;

      // Calculate progress relative to the content sections
      // Hero section is 100vh
      const scrollStart = vh;
      const sectionHeight = vh * SCROLL_HEIGHT_MULTIPLIER;
      
      // Calculate active section
      const relativeScroll = Math.max(0, scrollTop - scrollStart);
      const totalIndex = pathPoints.length;
      
      // Calculate continuous map progress
      // We want the map to travel smoothly across the entire journey
      // Total travel distance in pixels = sectionHeight * (totalIndex - 1)
      // But we also want the map to move WHILE the user is reading/scrolling a card
      
      const currentSectionIndex = Math.floor(relativeScroll / sectionHeight);
      const sectionProgress = (relativeScroll % sectionHeight) / sectionHeight;
      
      // Map Movement Logic
      // We map the scroll to the points index.
      // To make it smoother, we map the entire scrollable area to the path length.
      
      // Effective scrollable height for map travel
      // We start moving immediately from the first card
      let mapProgress = relativeScroll / sectionHeight;
      
      // Clamp map progress
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

      // Card Animation Logic (Direct DOM Manipulation for Performance)
      trip.points.forEach((_, idx) => {
