import { useState } from 'react';
import { motion } from 'motion/react';
import { 
  Eye, 
  EyeOff, 
  TrendingUp,
  CheckCircle2
} from 'lucide-react';
import { useMsal } from '@azure/msal-react';
import { loginRequest } from '../config/msalConfig';
import { authService } from '../services/authService';
import { useNavigate, Link } from 'react-router-dom';
import { toast } from 'sonner';

import fabricLogo from '../../../shared/styles/fabric_28_color.png';

export const LoginPage = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const { instance } = useMsal();
  const navigate = useNavigate();

  const handleMicrosoftLogin = async () => {
    setIsLoading(true);
    try {
      await instance.loginRedirect(loginRequest);
    } catch (error) {
      console.error('Login failed:', error);
      toast.error('Authentication failed. Please try again.');
      setIsLoading(false);
    }
  };

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      toast.error('Please enter your email and password.');
      return;
    }
    setIsLoading(true);
    try {
      const tokenPair = await authService.login({ email, password });
      localStorage.setItem('access_token', tokenPair.access_token);
      localStorage.setItem('refresh_token', tokenPair.refresh_token);
      toast.success('Successfully signed in');
      navigate('/setup');
    } catch (error: any) {
      console.error('Login failed:', error);
      toast.error(error.message === 'LOGIN_BAD_CREDENTIALS' 
        ? 'Invalid email or password.' 
        : error.message || 'Login failed. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <main className="h-screen flex flex-col lg:flex-row bg-[#F8FAFC] overflow-hidden font-sans">
      <section className="bg-white w-full lg:w-[45%] flex flex-col pt-8 lg:pt-16 px-6 lg:px-20 relative">
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.6 }}
          className="max-w-md w-full mx-auto"
        >
          {/* Brand Logo */}
          <div className="flex items-center gap-4 mb-6 pb-6 border-b border-zinc-100">
            <img src={fabricLogo} alt="Fabric Logo" className="w-14 h-14 object-contain" />
            <span className="font-display font-bold text-2xl tracking-tight text-zinc-900 leading-none">
              Fabric <br/><span className="text-forest-500 text-base">Accelerator</span>
            </span>
          </div>

          <div className="mb-6">
            <h1 className="text-2xl font-display font-bold text-zinc-900 mb-2">Sign In</h1>
            <p className="text-xs text-zinc-400 font-medium">Welcome back! Please enter your details.</p>
          </div>

          <div className="mb-4">
            <button 
              onClick={handleMicrosoftLogin}
              disabled={isLoading}
              className="w-full flex items-center justify-center gap-3 py-2.5 border border-zinc-200 rounded-xl hover:bg-zinc-50 transition-colors text-sm font-bold text-zinc-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 21 21" className="w-5 h-5">
                <rect x="1" y="1" width="9" height="9" fill="#f25022"/>
                <rect x="11" y="1" width="9" height="9" fill="#7fba00"/>
                <rect x="1" y="11" width="9" height="9" fill="#00a4ef"/>
                <rect x="11" y="11" width="9" height="9" fill="#ffb900"/>
              </svg>
              {isLoading ? 'Signing in...' : 'Sign in with Microsoft'}
            </button>
          </div>

          <div className="mb-4 relative">
            <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-zinc-100"></div></div>
            <div className="relative flex justify-center text-[10px] uppercase"><span className="bg-white px-2 text-zinc-400 font-bold tracking-widest">OR</span></div>
          </div>

          <form className="space-y-4" onSubmit={handleEmailLogin}>
            <div className="space-y-1.5">
              <label htmlFor="email" className="text-xs font-semibold text-zinc-700">Email</label>
              <div className="relative">
                <input 
                  type="email" 
                  id="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-4 py-2.5 bg-white border border-zinc-200 rounded-xl focus:outline-none focus:ring-4 focus:ring-forest-500/5 focus:border-forest-500 transition-all text-sm font-medium"
                  placeholder="Enter your email"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="password" className="text-xs font-semibold text-zinc-700">Password</label>
              <div className="relative">
                <input 
                  type={showPassword ? "text" : "password"} 
                  id="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-4 py-2.5 bg-white border border-zinc-200 rounded-xl focus:outline-none focus:ring-4 focus:ring-forest-500/5 focus:border-forest-500 transition-all text-sm font-medium"
                  placeholder="••••••••"
                />
                <button 
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-300 hover:text-zinc-500 transition-colors"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between mt-2">
              <div className="flex items-center gap-2">
                <input type="checkbox" id="remember" className="w-4 h-4 rounded border-zinc-300 text-forest-500 focus:ring-forest-500" />
                <label htmlFor="remember" className="text-xs text-zinc-500 font-medium">Remember for 30 Days</label>
              </div>
              <a href="#" className="text-xs font-bold text-forest-500 hover:underline">Forgot password</a>
            </div>

            <button 
              type="submit"
              disabled={isLoading}
              className="w-full bg-forest-500 text-white font-bold py-2.5 rounded-xl text-sm shadow-lg shadow-forest-500/20 hover:brightness-110 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? 'Signing in...' : 'Sign in'}
            </button>
          </form>

          <p className="mt-6 text-center text-xs text-zinc-500 font-medium">
            Don't have an account? <Link to="/register" className="text-forest-500 font-bold hover:underline">Sign up</Link>
          </p>
        </motion.div>
      </section>

      <section className="flex-1 bg-forest-500 relative overflow-hidden flex flex-col items-center pt-8 lg:pt-16 p-6 lg:p-20 text-center">
        <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-forest-400/20 blur-[100px] rounded-full translate-x-1/2 -translate-y-1/2"></div>
        <div className="absolute bottom-0 left-0 w-[500px] h-[500px] bg-emerald-400/20 blur-[100px] rounded-full -translate-x-1/2 translate-y-1/2"></div>

        <motion.div
           initial={{ opacity: 0, y: 30 }}
           animate={{ opacity: 1, y: 0 }}
           transition={{ duration: 0.8, delay: 0.2 }}
           className="relative z-10 w-full max-w-2xl"
        >
          <div className="mb-8">
            <h2 className="text-3xl lg:text-[40px] font-display font-bold text-white mb-3 leading-[1.15] tracking-tight">
              Welcome back! <br />
              <span className="text-white/90">Please sign in to your Accelerator account</span>
            </h2>
            <p className="text-emerald-50 text-sm lg:text-base max-w-xl mx-auto leading-relaxed font-medium">
              Manage your Microsoft Fabric medallion architecture, monitor data ingestion, and scale with confidence.
            </p>
          </div>

          <div className="relative mt-8">
            <div className="bg-white rounded-[2.5rem] p-8 lg:p-10 shadow-2xl relative overflow-hidden text-left">
              <div className="flex items-center justify-between mb-8">
                <div>
                  <h3 className="text-sm font-bold text-zinc-900 mb-1">Fabric Consumption</h3>
                  <p className="text-[10px] text-zinc-400 font-bold uppercase tracking-widest">Workspace: Enterprise_Alpha</p>
                </div>
                <div className="flex items-center gap-2">
                   <div className="flex items-center gap-1.5 px-3 py-1 bg-emerald-50 rounded-full">
                     <TrendingUp className="w-3 h-3 text-emerald-500" />
                     <span className="text-[10px] font-bold text-emerald-600">+12%</span>
                   </div>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-end">
                <div className="lg:col-span-2 space-y-4">
                  <div className="flex items-end gap-2 lg:gap-3 h-32">
                    {[60, 40, 80, 50, 90, 70, 45, 85, 30, 95].map((h, i) => (
                      <motion.div 
                        key={i}
                        initial={{ height: 0 }}
                        animate={{ height: `${h}%` }}
                        transition={{ delay: 0.5 + (i * 0.05), duration: 0.8 }}
                        className={`flex-1 rounded-t-lg transition-all ${i === 9 ? 'bg-forest-500' : 'bg-zinc-100 hover:bg-zinc-200'}`}
                      />
                    ))}
                  </div>
                  <div className="flex justify-between text-[8px] font-bold text-zinc-300 uppercase tracking-widest">
                    <span>Jan</span><span>Mar</span><span>May</span><span>Jul</span><span>Sep</span><span>Nov</span>
                  </div>
                </div>

                <div className="space-y-6">
                  <div className="relative w-32 h-32 mx-auto">
                    <svg className="w-full h-full -rotate-90" viewBox="0 0 36 36">
                       <circle cx="18" cy="18" r="15.5" fill="none" stroke="#F1F5F9" strokeWidth="4" />
                       <motion.circle cx="18" cy="18" r="15.5" fill="none" stroke="#22c55e" strokeWidth="4" strokeDasharray="100, 100" initial={{ strokeDashoffset: 100 }} animate={{ strokeDashoffset: 25 }} transition={{ delay: 1, duration: 1.5 }} />
                       <circle cx="18" cy="18" r="15.5" fill="none" stroke="#16a34a" strokeWidth="4" strokeDasharray="30, 100" strokeDashoffset="-75" />
                    </svg>
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                      <span className="text-xl font-black text-zinc-900">75%</span>
                      <span className="text-[8px] font-bold text-zinc-400 uppercase">Quota</span>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-forest-500"></div>
                        <span className="text-[10px] font-bold text-zinc-700">Compute</span>
                      </div>
                      <span className="text-[10px] font-bold text-zinc-900">4.2k</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-emerald-400"></div>
                        <span className="text-[10px] font-bold text-zinc-700">Storage</span>
                      </div>
                      <span className="text-[10px] font-bold text-zinc-900">1.8k</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <motion.div 
               initial={{ opacity: 0, x: 20 }}
               animate={{ opacity: 1, x: 0 }}
               transition={{ delay: 1.2 }}
               className="absolute -top-4 -right-4 bg-white p-4 rounded-2xl shadow-xl flex items-center gap-3 border border-zinc-100"
            >
              <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600">
                <CheckCircle2 className="w-5 h-5" />
              </div>
              <div className="text-left">
                <div className="text-[10px] font-black text-zinc-900 leading-none mb-1">Accelerator Active</div>
                <div className="text-[9px] font-bold text-zinc-400 uppercase tracking-tighter">Gold Layer Synchronized</div>
              </div>
            </motion.div>
          </div>
        </motion.div>
      </section>
    </main>
  );
};
