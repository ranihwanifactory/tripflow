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
            {trip.points.map((point, idx) => (
            <div key={point.id} className="min-h-screen flex items-center justify-center p-4 md:p-8">
                {/* Glassmorphism Card */}
                <div 
                    className={`
                        w-full max-w-2xl bg-white/85 backdrop-blur-xl rounded-3xl shadow-2xl overflow-hidden
                        transition-all duration-700 ease-out transform
                        ${idx === currentSegmentIndex ? 'opacity-100 translate-y-0 scale-100' : 'opacity-40 translate-y-10 scale-95 blur-[1px]'}
                    `}
                >
                    {/* Card Header Image */}
                    <div className="relative h-64 md:h-80 overflow-hidden group">
                        <img 
                            src={point.photoUrl} 
                            alt={point.title} 
                            className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" 
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
                        
                        <div className="absolute top-4 left-4">
                            <span className="bg-black/50 backdrop-blur-md text-white px-3 py-1 rounded-full text-xs font-bold border border-white/20">
                                #{idx + 1}
                            </span>
                        </div>

                        <div className="absolute bottom-0 left-0 p-6 text-white w-full">
                            <div className="flex items-center text-xs font-medium tracking-wider uppercase mb-1 opacity-90">
                                <Clock size={12} className="mr-1" />
                                {point.date.replace('T', ' ')}
                            </div>
                            <h2 className="text-3xl font-bold leading-tight">{point.title}</h2>
                        </div>
                    </div>

                    {/* Card Body */}
                    <div className="p-6 md:p-8">
                        <div className="flex items-start mb-6">
                            <MapPin className="text-indigo-600 mt-1 mr-3 shrink-0" size={20} />
                            <div>
                                <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wide">Location</h3>
                                <p className="text-lg font-medium text-gray-800">{point.locationName}</p>
                                <p className="text-sm text-gray-500">{point.address}</p>
                            </div>
                        </div>

                        <div className="prose prose-indigo max-w-none mb-8">
                            <p className="text-gray-600 leading-relaxed text-lg whitespace-pre-line font-light">
                                {point.description}
                            </p>
                        </div>

                        {/* Transport Info Footer */}
                        <div className="border-t border-gray-200 pt-4 flex items-center justify-between">
                            <div className="flex items-center text-gray-500 text-sm">
                                <Navigation size={16} className="mr-2" />
                                <span>Next Journey</span>
                            </div>
                            <div className="flex items-center bg-indigo-50 text-indigo-700 px-3 py-1.5 rounded-lg text-sm font-medium">
                                <span className="mr-2 text-lg">{getTransportIcon(point.transportToNext)}</span>
                                <span>{getTransportLabel(point.transportToNext)}로 이동</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            ))}
        </div>

        {/* Outro */}
        <div className="h-[50vh] flex flex-col justify-center items-center text-white p-8">
            <h2 className="text-3xl font-bold mb-4">Journey Completed</h2>
            <button 
                onClick={onClose}
                className="px-8 py-3 bg-white text-black rounded-full font-bold hover:bg-gray-200 transition shadow-lg"
            >
                지도 닫기
            </button>
        </div>
      </div>
    </div>
  );
};

export default TripViewer;