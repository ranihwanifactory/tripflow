
import React, { useEffect, useState } from 'react';
import { Download, Share, PlusSquare, X } from 'lucide-react';

interface InstallPromptProps {
  deferredPrompt: any;
  setDeferredPrompt: (prompt: any) => void;
  isIOS: boolean;
}

const InstallPrompt: React.FC<InstallPromptProps> = ({ deferredPrompt, setDeferredPrompt, isIOS }) => {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    // Show modal automatically if prompt is available OR it's iOS
    if (deferredPrompt || isIOS) {
      // Small delay for better UX (don't pop up instantly on load)
      const timer = setTimeout(() => setIsVisible(true), 2000);
      return () => clearTimeout(timer);
    }
  }, [deferredPrompt, isIOS]);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;
    
    // Show the native browser install prompt
    deferredPrompt.prompt();
    
    // Wait for the user to respond to the prompt
    const { outcome } = await deferredPrompt.userChoice;
    console.log(`User response to the install prompt: ${outcome}`);
    
    // Reset the prompt variable (it can only be used once)
    setDeferredPrompt(null);
    setIsVisible(false);
  };

  const handleClose = () => {
      setIsVisible(false);
  };

  if (!isVisible) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center pointer-events-none">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm pointer-events-auto" onClick={handleClose} />

      {/* Modal Card */}
      <div className="bg-white w-full max-w-sm m-4 rounded-2xl shadow-2xl overflow-hidden pointer-events-auto animate-fade-in-up relative">
        <button 
            onClick={handleClose} 
            className="absolute top-3 right-3 text-gray-400 hover:text-gray-600 p-1"
        >
            <X size={20} />
        </button>

        <div className="p-6 text-center">
            <div className="w-16 h-16 bg-indigo-600 rounded-2xl mx-auto flex items-center justify-center shadow-lg mb-4">
                <img src="/logo.png" alt="Logo" className="w-10 h-10 object-contain" onError={(e) => (e.target as HTMLImageElement).style.display = 'none'} />
                <Download className="text-white w-8 h-8" style={{display: 'var(--logo-display, block)'}} />
            </div>
            
            <h3 className="text-xl font-bold text-gray-900 mb-2">앱 설치하고 편하게 보세요!</h3>
            <p className="text-gray-500 text-sm mb-6 leading-relaxed">
               TripFlow를 홈 화면에 추가하면<br/>
               전체 화면으로 더 쾌적하게 여행 지도를 즐길 수 있습니다.
            </p>

            {isIOS ? (
                // iOS Instruction
                <div className="bg-gray-50 rounded-xl p-4 text-left space-y-3 border border-gray-100">
                    <div className="flex items-center text-sm text-gray-700">
                        <span className="w-6 h-6 flex items-center justify-center bg-gray-200 rounded-full text-xs font-bold mr-3 shrink-0">1</span>
                        <span>브라우저 하단의 <Share size={16} className="inline mx-1 text-blue-500"/> 버튼 클릭</span>
                    </div>
                    <div className="flex items-center text-sm text-gray-700">
                        <span className="w-6 h-6 flex items-center justify-center bg-gray-200 rounded-full text-xs font-bold mr-3 shrink-0">2</span>
                        <span>메뉴에서 <span className="font-bold">'홈 화면에 추가'</span> 선택</span>
                    </div>
                    <div className="flex items-center text-sm text-gray-700">
                        <span className="w-6 h-6 flex items-center justify-center bg-gray-200 rounded-full text-xs font-bold mr-3 shrink-0">3</span>
                        <span>우측 상단의 <span className="font-bold text-blue-600">'추가'</span> 버튼 클릭</span>
                    </div>
                </div>
            ) : (
                // Android / Desktop Button
                <button
                    onClick={handleInstallClick}
                    className="w-full bg-indigo-600 hover:bg-indigo-700 text-white py-3.5 rounded-xl font-bold text-base shadow-lg hover:shadow-indigo-500/30 transition flex items-center justify-center gap-2"
                >
                    <Download size={20} />
                    지금 앱 설치하기
                </button>
            )}
        </div>
      </div>
    </div>
  );
};

export default InstallPrompt;
