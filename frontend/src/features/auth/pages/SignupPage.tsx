import { useState } from 'react';
import { motion } from 'motion/react';
import { 
  Eye, 
  EyeOff, 
  Shield,
  Zap,
  BarChart3
} from 'lucide-react';
import { useMsal } from '@azure/msal-react';
import { loginRequest } from '../config/msalConfig';
import { authService } from '../services/authService';
import { useNavigate, Link } from 'react-router-dom';
import { toast } from 'sonner';

import fabricLogo from '../../../shared/styles/fabric_28_color.png';

export const SignupPage = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const { instance } = useMsal();
  const navigate = useNavigate();

  const handleMicrosoftSignup = async () => {
    setIsLoading(true);
    try {
      const response = await instance.loginPopup(loginRequest);
      if (response && response.idToken) {
        const tokenPair = await authService.entraIdExchange(response.idToken);
        localStorage.setItem('access_token', tokenPair.access_token);
        localStorage.setItem('refresh_token', tokenPair.refresh_token);
        toast.success('Successfully signed in with Microsoft');
        navigate('/setup');
      }
    } catch (error) {
      console.error('Signup failed:', error);
      toast.error('Authentication failed. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleEmailSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password || !confirmPassword) {
      toast.error('Please fill in all fields.');
      return;
    }
    if (password !== confirmPassword) {
      toast.error('Passwords do not match.');
      return;
    }
    if (password.length < 8) {
      toast.error('Password must be at least 8 characters.');
      return;
    }
    if (!/[A-Z]/.test(password)) {
      toast.error('Password must contain at least one uppercase letter.');
      return;
    }
    if (!/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
      toast.error('Password must contain at least one special character.');
      return;
    }

    setIsLoading(true);
    try {
      await authService.register({ email, password });
      // Auto-login after successful registration
      const tokenPair = await authService.login({ email, password });
      localStorage.setItem('access_token', tokenPair.access_token);
      localStorage.setItem('refresh_token', tokenPair.refresh_token);
      toast.success('Account created successfully!');
      navigate('/setup');
    } catch (error: any) {
      console.error('Signup failed:', error);
      toast.error(error.message || 'Registration failed. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <main className="h-screen flex flex-col lg:flex-row bg-[#F8FAFC] overflow-hidden font-sans">
      <section className="bg-white w-full lg:w-[45%] flex flex-col pt-8 lg:pt-12 px-6 lg:px-20 relative overflow-y-auto">
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
            <h1 className="text-2xl font-display font-bold text-zinc-900 mb-2">Create Account</h1>
            <p className="text-xs text-zinc-400 font-medium">Get started with your Fabric Accelerator account.</p>
          </div>

          <div className="mb-4">
            <button 
              onClick={handleMicrosoftSignup}
              disabled={isLoading}
              className="w-full flex items-center justify-center gap-3 py-2.5 border border-zinc-200 rounded-xl hover:bg-zinc-50 transition-colors text-sm font-bold text-zinc-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 21 21" className="w-5 h-5">
                <rect x="1" y="1" width="9" height="9" fill="#f25022"/>
                <rect x="11" y="1" width="9" height="9" fill="#7fba00"/>
                <rect x="1" y="11" width="9" height="9" fill="#00a4ef"/>
                <rect x="11" y="11" width="9" height="9" fill="#ffb900"/>
              </svg>
              {isLoading ? 'Signing up...' : 'Sign up with Microsoft'}
            </button>
          </div>

          <div className="mb-4 relative">
            <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-zinc-100"></div></div>
            <div className="relative flex justify-center text-[10px] uppercase"><span className="bg-white px-2 text-zinc-400 font-bold tracking-widest">OR</span></div>
          </div>

          {/* Form */}
          <form className="space-y-4" onSubmit={handleEmailSignup}>
            <div className="space-y-1.5">
              <label htmlFor="email" className="text-xs font-semibold text-zinc-700">Email</label>
              <input 
                type="email" 
                id="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-2.5 bg-white border border-zinc-200 rounded-xl focus:outline-none focus:ring-4 focus:ring-forest-500/5 focus:border-forest-500 transition-all text-sm font-medium"
                placeholder="Enter your email"
              />
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
                  placeholder="Create a password"
                />
                <button 
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-300 hover:text-zinc-500 transition-colors"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <p className="text-[10px] text-zinc-400 font-medium">Min 8 chars, 1 uppercase, 1 special character</p>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="confirmPassword" className="text-xs font-semibold text-zinc-700">Confirm Password</label>
              <div className="relative">
                <input 
                  type={showConfirmPassword ? "text" : "password"} 
                  id="confirmPassword"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full px-4 py-2.5 bg-white border border-zinc-200 rounded-xl focus:outline-none focus:ring-4 focus:ring-forest-500/5 focus:border-forest-500 transition-all text-sm font-medium"
                  placeholder="Confirm your password"
                />
                <button 
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-300 hover:text-zinc-500 transition-colors"
                >
                  {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button 
              type="submit"
              disabled={isLoading}
              className="w-full bg-forest-500 text-white font-bold py-2.5 rounded-xl text-sm shadow-lg shadow-forest-500/20 hover:brightness-110 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? 'Creating account...' : 'Create account'}
            </button>
          </form>

          <p className="mt-6 mb-8 text-center text-xs text-zinc-500 font-medium">
            Already have an account? <Link to="/login" className="text-forest-500 font-bold hover:underline">Sign in</Link>
          </p>
        </motion.div>
      </section>

      {/* Right Side - Branded Welcome */}
      <section className="flex-1 bg-forest-500 relative overflow-hidden flex flex-col items-center pt-8 lg:pt-16 p-6 lg:p-20 text-center">
        {/* Background Gradients */}
        <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-forest-400/20 blur-[100px] rounded-full translate-x-1/2 -translate-y-1/2"></div>
        <div className="absolute bottom-0 left-0 w-[500px] h-[500px] bg-emerald-400/20 blur-[100px] rounded-full -translate-x-1/2 translate-y-1/2"></div>

        <motion.div
           initial={{ opacity: 0, y: 30 }}
           animate={{ opacity: 1, y: 0 }}
           transition={{ duration: 0.8, delay: 0.2 }}
           className="relative z-10 w-full max-w-2xl"
        >
          <div className="mb-10">
            <h2 className="text-3xl lg:text-[40px] font-display font-bold text-white mb-3 leading-[1.15] tracking-tight">
              Start your journey <br />
              <span className="text-white/90">with Fabric Accelerator</span>
            </h2>
            <p className="text-emerald-50 text-sm lg:text-base max-w-xl mx-auto leading-relaxed font-medium">
              Deploy medallion architecture in minutes. Monitor, manage, and scale your Microsoft Fabric workloads.
            </p>
          </div>

          {/* Feature Cards */}
          <div className="space-y-4 max-w-md mx-auto">
            {[
              { icon: Zap, title: 'Rapid Deployment', desc: 'Set up your medallion architecture in under 5 minutes with guided workflows.' },
              { icon: Shield, title: 'Enterprise Security', desc: 'Built-in credential management, role-based access control, and audit logging.' },
              { icon: BarChart3, title: 'Real-time Monitoring', desc: 'Track Fabric capacity usage, pipeline health, and data quality metrics.' },
            ].map((feature, i) => (
              <motion.div
                key={feature.title}
                initial={{ opacity: 0, x: 30 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.5 + (i * 0.15), duration: 0.6 }}
                className="bg-white/10 backdrop-blur-sm rounded-2xl p-5 flex items-start gap-4 text-left border border-white/10"
              >
                <div className="w-10 h-10 rounded-xl bg-white/15 flex items-center justify-center shrink-0">
                  <feature.icon className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white mb-1">{feature.title}</h3>
                  <p className="text-xs text-emerald-100/80 leading-relaxed font-medium">{feature.desc}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </motion.div>
      </section>
    </main>
  );
};
