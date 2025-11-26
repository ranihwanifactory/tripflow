import React, { useEffect, useRef, useState, useMemo } from 'react';
import { TripData, TripPoint, TransportType } from '../types';
import { Car, Plane, Anchor, Footprints, Train, Bus, MapPin, ArrowDown } from 'lucide-react';

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

const TripViewer: React.FC<TripViewerProps> = ({ trip, onClose }) => {
  const mapRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
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

  useEffect(() => {
    if (!mapRef.current) return;

    // Initialize Map
    const options = {
      center: pathPoints[0].latlng,
      level: 4,
      draggable: false, // Disable manual map drag for better scroll experience
      zoomable: false
    };
    const newMap = new window.kakao.maps.Map(mapRef.current, options);
    setMap(newMap);

    // Draw Polyline
    const path = pathPoints.map(p => p.latlng);
    const polyline = new window.kakao.maps.Polyline({
      path: path,
      strokeWeight: 6,
      strokeColor: '#6366f1', // Indigo-500
      strokeOpacity: 0.8,
      strokeStyle: 'solid'
    });
    polyline.setMap(newMap);

    // Create Markers for each point
    pathPoints.forEach((p, index) => {
      const markerContent = document.createElement('div');
      markerContent.className = 'flex flex-col items-center justify-center';
      markerContent.innerHTML = `
        <div class="bg-indigo-600 text-white rounded-full w-8 h-8 flex items-center justify-center font-bold shadow-lg border-2 border-white z-10">
          ${index + 1}
        </div>
      `;
      const customOverlay = new window.kakao.maps.CustomOverlay({
        position: p.latlng,
        content: markerContent,
        yAnchor: 1
      });
      customOverlay.setMap(newMap);
    });

    // Create Transport Overlay (The moving element)
    const transportContent = document.createElement('div');
    transportContent.className = 'transport-icon text-4xl filter drop-shadow-lg transition-transform duration-300';
    transportContent.style.transformOrigin = 'center center';
    transportContent.innerText = getTransportIcon(trip.points[0].transportToNext);

    const overlay = new window.kakao.maps.CustomOverlay({
      position: pathPoints[0].latlng,
      content: transportContent,
      zIndex: 100
    });
    overlay.setMap(newMap);
    setTransportOverlay(overlay);

    // Set bounds to see whole trip initially (optional, but we focus on first point)
    // const bounds = new window.kakao.maps.LatLngBounds();
    // pathPoints.forEach(p => bounds.extend(p.latlng));
    // newMap.setBounds(bounds);

  }, [pathPoints]);

  // Handle Scroll to Animate
  useEffect(() => {
    const handleScroll = () => {
      if (!containerRef.current || !map || !transportOverlay || pathPoints.length < 2) return;

      const container = containerRef.current;
      const scrollHeight = container.scrollHeight - window.innerHeight;
      const scrollTop = container.scrollTop;
      
      // Calculate global progress (0 to 1)
      const progress = Math.min(Math.max(scrollTop / scrollHeight, 0), 1);
      
      // Map global progress to segments
      const totalSegments = pathPoints.length - 1;
      const exactIndex = progress * totalSegments;
      const index = Math.floor(exactIndex); // Current starting point index
      const segmentProgress = exactIndex - index; // Progress within current segment (0-1)

      if (index >= totalSegments) return; // End of path

      setCurrentSegmentIndex(index);

      // Interpolate Position
      const start = pathPoints[index].latlng;
      const end = pathPoints[index + 1].latlng;
      
      const currentLat = start.getLat() + (end.getLat() - start.getLat()) * segmentProgress;
      const currentLng = start.getLng() + (end.getLng() - start.getLng()) * segmentProgress;
      const currentPos = new window.kakao.maps.LatLng(currentLat, currentLng);

      // Update Overlay Position
      transportOverlay.setPosition(currentPos);
      
      // Update Transport Icon based on segment
      const iconDiv = transportOverlay.getContent();
      if(iconDiv) {
        iconDiv.innerText = getTransportIcon(trip.points[index].transportToNext);
      }

      // Center Map on Transport
      map.panTo(currentPos);
    };

    const container = containerRef.current;
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
    <div className="fixed inset-0 bg-white z-50 flex flex-col md:flex-row">
      {/* Sticky Map Section */}
      <div className="h-[40vh] md:h-screen md:w-1/2 order-1 md:order-2 sticky top-0 md:relative">
         <div ref={mapRef} className="w-full h-full" />
         <button 
           onClick={onClose}
           className="absolute top-4 right-4 z-20 bg-white px-4 py-2 rounded-full shadow-lg font-bold hover:bg-gray-100"
         >
           닫기
         </button>
      </div>

      {/* Scrollable Story Section */}
      <div 
        ref={containerRef} 
        className="h-[60vh] md:h-screen md:w-1/2 order-2 md:order-1 overflow-y-auto no-scrollbar relative bg-slate-50"
      >
        <div className="h-[50vh] flex flex-col justify-center items-center text-center p-8 bg-gradient-to-b from-indigo-100 to-slate-50">
          <h1 className="text-4xl font-bold text-indigo-900 mb-4">{trip.title}</h1>
          <p className="text-gray-600">스크롤하여 여행을 떠나보세요</p>
          <ArrowDown className="mt-8 animate-bounce text-indigo-500" />
        </div>

        {trip.points.map((point, idx) => (
          <div key={point.id} className="min-h-screen flex items-center justify-center p-6">
            <div className={`bg-white p-6 rounded-2xl shadow-xl max-w-lg w-full transition-all duration-500 transform ${idx === currentSegmentIndex ? 'scale-105 ring-4 ring-indigo-200' : 'opacity-60 scale-95'}`}>
              <div className="relative h-48 mb-4 overflow-hidden rounded-xl">
                 <img src={point.photoUrl} alt={point.title} className="w-full h-full object-cover" />
                 <div className="absolute top-2 right-2 bg-black/60 text-white px-3 py-1 rounded-full text-xs">
                    {point.date.replace('T', ' ')}
                 </div>
              </div>
              
              <div className="flex items-center mb-2 text-indigo-600 text-sm font-semibold tracking-wide uppercase">
                <MapPin size={14} className="mr-1" />
                {point.locationName}
              </div>
              
              <h2 className="text-2xl font-bold text-gray-800 mb-3">{point.title}</h2>
              <p className="text-gray-600 leading-relaxed whitespace-pre-line mb-4">
                {point.description}
              </p>

              <div className="pt-4 border-t border-gray-100 flex items-center text-gray-500 text-sm">
                <span className="mr-2">다음 장소로:</span>
                <span className="font-medium text-gray-800 flex items-center bg-gray-100 px-2 py-1 rounded">
                   {getTransportIcon(point.transportToNext)} 
                   <span className="ml-1">
                     {point.transportToNext === 'CAR' && '자동차'}
                     {point.transportToNext === 'WALK' && '도보'}
                     {point.transportToNext === 'TRAIN' && '기차'}
                     {point.transportToNext === 'BUS' && '버스'}
                     {point.transportToNext === 'PLANE' && '비행기'}
                     {point.transportToNext === 'SHIP' && '배'}
                   </span>
                </span>
              </div>
            </div>
          </div>
        ))}

        <div className="h-[50vh] flex justify-center items-center text-gray-400">
          여행의 끝입니다.
        </div>
      </div>
    </div>
  );
};

export default TripViewer;