import React, { useEffect, useRef, useState, useMemo } from 'react';
import { TripData, TransportType } from '../types';
import { MapPin, ArrowDown, X, Clock, Navigation } from 'lucide-react';

interface TripViewerProps {
  trip: TripData;
  onClose: () => void;
}

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
  const [currentSegmentIndex, setCurrentSegmentIndex] = useState(0);

  // Parse points to clean Kakao LatLng objects
  const pathPoints = useMemo(() => {
    return trip.points.map(p => ({
      latlng: new window.kakao.maps.LatLng(p.lat, p.lng),
      data: p
    }));
  }, [trip]);

  // 1. Initialize Map (Background)
  useEffect(() => {
    if (!mapRef.current) return;

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

    // Draw Polyline (Thicker and lighter for contrast against dark overlay)
    const path = pathPoints.map(p => p.latlng);
    const polyline = new window.kakao.maps.Polyline({
      path: path,
      strokeWeight: 8,
      strokeColor: '#FFFFFF', // White path
      strokeOpacity: 0.6,
      strokeStyle: 'solid'
    });
    polyline.setMap(newMap);

    // Create Markers
    pathPoints.forEach((p, index) => {
      const markerContent = document.createElement('div');
      // Minimalist marker
      markerContent.innerHTML = `
        <div style="
          width: 12px; 
          height: 12px; 
          background: white; 
          border-radius: 50%; 
          box-shadow: 0 0 10px rgba(255,255,255,0.8);
          border: 2px solid #4F46E5;
        "></div>
      `;
      const customOverlay = new window.kakao.maps.CustomOverlay({
        position: p.latlng,
        content: markerContent,
        yAnchor: 0.5
      });
      customOverlay.setMap(newMap);
    });

    // Transport Overlay
    const transportContent = document.createElement('div');
    transportContent.className = 'transport-icon text-5xl filter drop-shadow-2xl transition-transform duration-300';
    transportContent.style.textShadow = '0 4px 8px rgba(0,0,0,0.3)';
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
      // Total scrollable height minus the viewport height gives us the scrollable distance
      // However, we have a big header and footer space.
      // Let's calculate progress based on the "Cards" section.
      
      const scrollTop = container.scrollTop;
      const scrollHeight = container.scrollHeight - window.innerHeight;
      
      // Calculate global progress (0 to 1)
      const progress = Math.min(Math.max(scrollTop / scrollHeight, 0), 1);
      
      const totalSegments = pathPoints.length - 1;
      const exactIndex = progress * totalSegments;
      const index = Math.floor(exactIndex); 
      const segmentProgress = exactIndex - index;

      if (index >= totalSegments) return;

      setCurrentSegmentIndex(index);

      // Interpolate Position
      const start = pathPoints[index].latlng;
      const end = pathPoints[index + 1].latlng;
      
      const currentLat = start.getLat() + (end.getLat() - start.getLat()) * segmentProgress;
      const currentLng = start.getLng() + (end.getLng() - start.getLng()) * segmentProgress;
      const currentPos = new window.kakao.maps.LatLng(currentLat, currentLng);

      // Update Overlay
      transportOverlay.setPosition(currentPos);
      
      const iconDiv = transportOverlay.getContent();
      if(iconDiv) {
        iconDiv.innerText = getTransportIcon(trip.points[index].transportToNext);
      }

      // Smooth Pan
      map.panTo(currentPos);
    };

    const container = scrollContainerRef.current;
    if (container) {
      container.addEventListener('scroll', handleScroll);
    }
    return () => {
      if (container) {
        container.removeEventListener('scroll', handleScroll);
      }
    };
  }, [map, transportOverlay, pathPoints, trip]);


  return (
    <div className="fixed inset-0 z-50 bg-black">
      
      {/* 1. Background Map Layer */}
      <div className="fixed inset-0 z-0">
        <div ref={mapRef} className="w-full h-full" />
        {/* Dark Dimmer / Blind Effect */}
        <div className="absolute inset-0 bg-black/40 pointer-events-none backdrop-blur-[2px]" />
      </div>

      {/* 2. Fixed Header Elements */}
      <button 
        onClick={onClose}
        className="fixed top-6 right-6 z-50 bg-white/20 hover:bg-white/40 backdrop-blur-md text-white p-2 rounded-full transition-all border border-white/30"
      >
        <X size={24} />
      </button>

      {/* 3. Scrollable Content Layer */}
      <div 
        ref={scrollContainerRef} 
        className="relative z-10 w-full h-full overflow-y-auto no-scrollbar scroll-smooth"
      >
        {/* Hero Section */}
        <div className="min-h-screen flex flex-col justify-center items-center text-center p-8 text-white">
          <div className="animate-fade-in-up max-w-4xl">
            <span className="inline-block px-4 py-1 rounded-full border border-white/30 bg-black/30 backdrop-blur-sm text-sm font-light mb-6 tracking-widest uppercase">
              Travel Log
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
                <span className="text-xs tracking-widest uppercase">Scroll to explore</span>
                <ArrowDown size={24} />
            </div>
          </div>
        </div>

        {/* Trip Points Stream */}
        <div className="pb-[50vh]">
            {trip.points.map((point, idx) =>