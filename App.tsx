import React, { useState, useEffect } from 'react';
import Auth from './components/Auth';
import TripEditor from './components/TripEditor';
import TripViewer from './components/TripViewer';
import { auth, db } from './firebase';
import { User, onAuthStateChanged, signOut } from 'firebase/auth';
import { collection, query, where, getDocs, deleteDoc, doc } from 'firebase/firestore';
import { TripData } from './types';
import { Map, Plus, LogOut, Loader2, MapPin, Pencil, Trash2 } from 'lucide-react';

const App: React.FC = () => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'LIST' | 'create' | 'EDIT' | 'VIEW'>('LIST');
  const [trips, setTrips] = useState<TripData[]>([]);
  const [selectedTrip, setSelectedTrip] = useState<TripData | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (user && view === 'LIST') {
      fetchTrips();
    }
  }, [user, view]);

  const fetchTrips = async () => {
    if (!user) return;
    try {
      const q = query(
        collection(db, 'trips'),
        where('userId', '==', user.uid)
      );
      const querySnapshot = await getDocs(q);
      const fetchedTrips: TripData[] = [];
      querySnapshot.forEach((doc) => {
        fetchedTrips.push({ id: doc.id, ...doc.data() } as TripData);
      });
      fetchedTrips.sort((a,b) => b.createdAt - a.createdAt);
      setTrips(fetchedTrips);
    } catch (error) {
      console.error("Error fetching trips:", error);
    }
  };

  const handleEditTrip = (e: React.MouseEvent, trip: TripData) => {
    e.stopPropagation();
    setSelectedTrip(trip);
    setView('EDIT');
  };

  const handleDeleteTrip = async (e: React.MouseEvent, tripId: string) => {
    e.stopPropagation();
    if (window.confirm("정말로 이 여행 기록을 삭제하시겠습니까? 복구할 수 없습니다.")) {
        try {
            await deleteDoc(doc(db, "trips", tripId));
            setTrips(trips.filter(t => t.id !== tripId));
            alert("삭제되었습니다.");
        } catch (error) {
            console.error("Error deleting trip:", error);
            alert("삭제 중 오류가 발생했습니다.");
        }
    }
  };

  const handleSignOut = async () => {
    await signOut(auth);
  };

  if (loading) return <div className="h-screen flex justify-center items-center"><Loader2 className="animate-spin text-indigo-600" size={48} /></div>;

  if (!user) {
    return <Auth />;
  }

  if (view === 'create') {
    return <TripEditor onFinish={() => setView('LIST')} />;
  }

  if (view === 'EDIT') {
      return <TripEditor onFinish={() => { setSelectedTrip(null); setView('LIST'); }} initialData={selectedTrip} />;
  }

  if (view === 'VIEW' && selectedTrip) {
    return <TripViewer trip={selectedTrip} onClose={() => { setSelectedTrip(null); setView('LIST'); }} />;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex justify-between items-center">
          <div className="flex items-center space-x-2 cursor-pointer" onClick={() => setView('LIST')}>
            <Map className="text-indigo-600" />
            <h1 className="text-xl font-bold text-gray-900">TripFlow</h1>
          </div>
          <div className="flex items-center space-x-4">
             <span className="text-sm text-gray-500 hidden sm:block">{user.email}</span>
             <button onClick={handleSignOut} className="text-gray-500 hover:text-red-500">
               <LogOut size={20} />
             </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex justify-between items-center mb-8">
          <h2 className="text-2xl font-bold text-gray-800">나의 여행 기록</h2>
          <button 
            onClick={() => setView('create')}
            className="flex items-center bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 transition shadow-md"
          >
            <Plus size={20} className="mr-2" /> 여행 추가
          </button>
        </div>

        {trips.length === 0 ? (
          <div className="text-center py-20 bg-white rounded-xl shadow-sm border border-dashed border-gray-300">
            <Map size={48} className="mx-auto text-gray-300 mb-4" />
            <p className="text-gray-500 text-lg">아직 등록된 여행이 없습니다.</p>
            <p className="text-gray-400">첫 번째 여행을 기록해보세요!</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {trips.map((trip) => (
              <div 
                key={trip.id} 
                onClick={() => { setSelectedTrip(trip); setView('VIEW'); }}
                className="bg-white rounded-xl shadow-sm hover:shadow-xl transition-shadow cursor-pointer overflow-hidden border border-gray-100 group relative"
              >
                {/* Edit/Delete Controls */}
                <div className="absolute top-2 right-2 z-10 flex space-x-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button 
                        onClick={(e) => handleEditTrip(e, trip)}
                        className="p-2 bg-white/90 hover:bg-white text-indigo-600 rounded-full shadow-md"
                        title="수정"
                    >
                        <Pencil size={16} />
                    </button>
                    <button 
                        onClick={(e) => trip.id && handleDeleteTrip(e, trip.id)}
                        className="p-2 bg-white/90 hover:bg-white text-red-500 rounded-full shadow-md"
                        title="삭제"
                    >
                        <Trash2 size={16} />
                    </button>
                </div>

                <div className="h-48 overflow-hidden relative">
                   <img 
                    src={trip.points[0]?.photoUrl || 'https://picsum.photos/400/300'} 
                    alt={trip.title} 
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                   />
                   <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
                   <div className="absolute bottom-4 left-4 text-white">
                      <h3 className="text-xl font-bold">{trip.title}</h3>
                      <p className="text-sm opacity-90">{new Date(trip.createdAt).toLocaleDateString()}</p>
                   </div>
                </div>
                <div className="p-4">
                  <div className="flex items-center text-sm text-gray-500 mb-2">
                    <MapPin size={14} className="mr-1" />
                    {trip.points.length}개의 경유지
                  </div>
                  <p className="text-gray-600 text-sm line-clamp-2">
                    {trip.points[0]?.description || '여행 설명이 없습니다.'}
                  </p>
                  <div className="mt-4 flex justify-end">
                    <span className="text-indigo-600 text-sm font-medium hover:underline">지도 보기 &rarr;</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
};

export default App;