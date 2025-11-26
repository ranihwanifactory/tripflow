
import React, { useState } from 'react';
import { auth, googleProvider } from '../firebase';
import { signInWithPopup, signInWithEmailAndPassword, createUserWithEmailAndPassword } from 'firebase/auth';
import { LogIn, UserPlus, X } from 'lucide-react';

interface AuthProps {
    onClose: () => void;
}

const Auth: React.FC<AuthProps> = ({ onClose }) => {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleGoogleLogin = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
      onClose();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      if (isLogin) {
        await signInWithEmailAndPassword(auth, email, password);
      } else {
        await createUserWithEmailAndPassword(auth, email, password);
      }
      onClose();
    } catch (err: any) {
      setError(err.message);
    }
  };

  // Close modal when clicking background
  const handleBackdropClick = (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) {
          onClose();
      }
  };

  return (
    <div 
        className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in"
        onClick={handleBackdropClick}
    >
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
        {/* Close Button */}
        <button 
            onClick={onClose}
            className="absolute top-4 right-4 p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition z-10"
        >
            <X size={20} />
        </button>

        <div className="flex flex-col md:flex-row">
            {/* Image Side (Hidden on mobile) */}
            <div 
                className="hidden md:block w-1/3 bg-cover bg-center"
                style={{ backgroundImage: 'url("https://images.unsplash.com/photo-1469854523086-cc02fe5d8800?ixlib=rb-4.0.3&auto=format&fit=crop&w=600&q=80")' }}
            >
                <div className="h-full w-full bg-indigo-900/40 flex items-end p-4">
                    <p className="text-white text-xs font-light leading-relaxed opacity-90">
                        "여행은 우리가 사는 세상을 새로운 눈으로 보게 해줍니다."
                    </p>
                </div>
            </div>

            {/* Form Side */}
            <div className="flex-1 p-8">
                <div className="text-center mb-6">
                    <h2 className="text-2xl font-bold text-gray-800">
                    {isLogin ? 'TripFlow 로그인' : '회원가입'}
                    </h2>
                    <p className="text-sm text-gray-500 mt-1">
                        {isLogin ? '여행 기록을 관리하려면 로그인하세요' : '새로운 여정을 시작하세요'}
                    </p>
                </div>
                
                <form onSubmit={handleEmailAuth} className="space-y-4">
                <div>
                    <label className="block text-xs font-bold text-gray-700 uppercase tracking-wide mb-1">이메일</label>
                    <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="mt-1 block w-full px-3 py-2 bg-gray-50 border border-gray-300 rounded-lg shadow-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 transition"
                    required
                    />
                </div>
                <div>
                    <label className="block text-xs font-bold text-gray-700 uppercase tracking-wide mb-1">비밀번호</label>
                    <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="mt-1 block w-full px-3 py-2 bg-gray-50 border border-gray-300 rounded-lg shadow-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 transition"
                    required
                    />
                </div>
                
                {error && <p className="text-red-500 text-xs bg-red-50 p-2 rounded border border-red-100">{error}</p>}

                <button
                    type="submit"
                    className="w-full py-2.5 rounded-lg shadow-md text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 transition-colors flex justify-center items-center gap-2"
                >
                    {isLogin ? <LogIn size={16}/> : <UserPlus size={16}/>}
                    {isLogin ? '로그인' : '가입하기'}
                </button>
                </form>

                <div className="mt-6">
                    <div className="relative">
                        <div className="absolute inset-0 flex items-center">
                        <div className="w-full border-t border-gray-200" />
                        </div>
                        <div className="relative flex justify-center text-sm">
                        <span className="px-2 bg-white text-gray-400 text-xs">또는</span>
                        </div>
                    </div>

                    <button
                        onClick={handleGoogleLogin}
                        className="mt-4 w-full flex justify-center items-center py-2.5 px-4 border border-gray-300 rounded-lg shadow-sm bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                    >
                        <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="Google" className="w-5 h-5 mr-2" />
                        구글 계정으로 시작
                    </button>
                </div>

                <div className="mt-6 text-center">
                <button
                    onClick={() => setIsLogin(!isLogin)}
                    className="text-sm text-indigo-600 hover:text-indigo-800 font-semibold"
                >
                    {isLogin ? '아직 회원이 아니신가요? 회원가입' : '이미 계정이 있으신가요? 로그인'}
                </button>
                </div>
            </div>
        </div>
      </div>
    </div>
  );
};

export default Auth;
