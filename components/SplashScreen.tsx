import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Mic, Swords, Target, Sparkles, Zap, Radio } from 'lucide-react';

interface SplashScreenProps {
  onEnter: () => void;
  expectedPassword?: string;
  isUnlocked?: boolean;
  onUnlock?: () => void;
}

export const SplashScreen: React.FC<SplashScreenProps> = ({
  onEnter,
  expectedPassword,
  isUnlocked = false,
  onUnlock,
}) => {
  const { t } = useTranslation();
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const requiresPassword = Boolean(expectedPassword);

  const handleEnter = () => {
    if (!requiresPassword || isUnlocked) {
      onEnter();
      return;
    }

    if (password.trim() === expectedPassword) {
      onUnlock?.();
      onEnter();
      setError('');
      return;
    }

    setError('Incorrect password');
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950 flex flex-col items-center justify-center p-8 overflow-hidden">
      {/* Animated background glow */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-indigo-600/20 rounded-full blur-[120px] animate-pulse" />
        <div className="absolute top-1/3 left-1/3 w-[400px] h-[400px] bg-rose-500/10 rounded-full blur-[100px] animate-pulse" style={{ animationDelay: '1s' }} />
        <div className="absolute bottom-1/3 right-1/3 w-[300px] h-[300px] bg-emerald-500/10 rounded-full blur-[80px] animate-pulse" style={{ animationDelay: '2s' }} />
      </div>

      {/* Content */}
      <div className="relative z-10 text-center max-w-2xl">
        {/* Animated icon cluster above title */}
        <div className="flex items-center justify-center gap-4 mb-6 animate-fade-in">
          <Zap className="w-6 h-6 text-amber-400 animate-zap" />
          <Radio className="w-8 h-8 text-indigo-400 animate-radio-pulse" />
          <Zap className="w-6 h-6 text-amber-400 animate-zap" style={{ animationDelay: '0.5s' }} />
        </div>

        {/* Logo / Title */}
        <h1 className="text-5xl md:text-7xl font-bold tracking-tighter text-white uppercase italic mb-4 animate-fade-in">
          {t('splash.title').split(' ')[0]}{' '}
          <span className="text-indigo-500 animate-title-glow">{t('splash.title').split(' ').slice(1).join(' ')}</span>
        </h1>
        
        <p className="text-slate-400 text-sm uppercase tracking-[0.3em] mb-8 animate-fade-in-delay-1 flex items-center justify-center gap-2">
          <Sparkles className="w-4 h-4 text-indigo-400 animate-sparkle" />
          {t('splash.subtitle')}
          <Sparkles className="w-4 h-4 text-indigo-400 animate-sparkle" style={{ animationDelay: '0.3s' }} />
        </p>

        {/* Tagline */}
        <p className="text-xl md:text-2xl text-slate-300 mb-12 leading-relaxed animate-fade-in-delay-2">
          {t('splash.tagline')}
          <br />
          <span className="text-indigo-400">{t('splash.taglineHighlight')}</span>
        </p>

        {/* Features */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12 animate-fade-in-delay-3">
          <div className="group bg-slate-900/60 border border-slate-800 rounded-2xl p-6 hover:border-indigo-500/50 hover:bg-slate-900/80 transition-all duration-300">
            <div className="relative w-14 h-14 mx-auto mb-4 flex items-center justify-center">
              <div className="absolute inset-0 bg-indigo-500/20 rounded-full animate-ping-slow" />
              <Mic className="w-8 h-8 text-indigo-400 relative z-10 group-hover:scale-110 transition-transform animate-mic-bounce" />
            </div>
            <h3 className="text-white font-semibold mb-2">{t('splash.features.liveVoiceAI.title')}</h3>
            <p className="text-slate-400 text-sm">{t('splash.features.liveVoiceAI.description')}</p>
          </div>
          <div className="group bg-slate-900/60 border border-slate-800 rounded-2xl p-6 hover:border-rose-500/50 hover:bg-slate-900/80 transition-all duration-300">
            <div className="relative w-14 h-14 mx-auto mb-4 flex items-center justify-center">
              <Swords className="w-8 h-8 text-rose-400 relative z-10 group-hover:scale-110 transition-transform animate-swords-clash" />
            </div>
            <h3 className="text-white font-semibold mb-2">{t('splash.features.epicRivalries.title')}</h3>
            <p className="text-slate-400 text-sm">{t('splash.features.epicRivalries.description')}</p>
          </div>
          <div className="group bg-slate-900/60 border border-slate-800 rounded-2xl p-6 hover:border-emerald-500/50 hover:bg-slate-900/80 transition-all duration-300">
            <div className="relative w-14 h-14 mx-auto mb-4 flex items-center justify-center">
              <Target className="w-8 h-8 text-emerald-400 relative z-10 group-hover:scale-110 transition-transform animate-target-lock" />
            </div>
            <h3 className="text-white font-semibold mb-2">{t('splash.features.youModerate.title')}</h3>
            <p className="text-slate-400 text-sm">{t('splash.features.youModerate.description')}</p>
          </div>
        </div>

        {/* Enter button */}
        <div className="flex flex-col items-center gap-4">
          {requiresPassword && !isUnlocked && (
            <div className="w-full max-w-sm">
              <input
                type="password"
                value={password}
                onChange={event => setPassword(event.target.value)}
                onKeyDown={event => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    handleEnter();
                  }
                }}
                placeholder="Password"
                className="w-full rounded-full bg-slate-900/80 border border-slate-700 px-5 py-3 text-sm text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-indigo-500"
              />
              {error && (
                <p className="mt-2 text-xs text-rose-400">{error}</p>
              )}
            </div>
          )}
          <button
            onClick={handleEnter}
            className="group relative px-12 py-4 bg-indigo-600 hover:bg-indigo-500 text-white font-bold uppercase tracking-widest text-sm rounded-full transition-all shadow-2xl shadow-indigo-500/30 hover:shadow-indigo-500/50 active:scale-95 animate-fade-in-delay-4 overflow-hidden"
          >
          <span className="relative z-10 flex items-center gap-2">
            <Zap className="w-4 h-4 animate-zap" />
            {t('splash.enterButton')}
            <Zap className="w-4 h-4 animate-zap" style={{ animationDelay: '0.3s' }} />
          </span>
          <div className="absolute inset-0 bg-gradient-to-r from-indigo-600 via-purple-500 to-indigo-600 opacity-0 group-hover:opacity-100 transition-opacity animate-gradient-shift" />
          <div className="absolute inset-0 rounded-full bg-indigo-400/20 blur-xl group-hover:blur-2xl transition-all" />
          </button>
        </div>

        <p className="text-slate-600 text-xs mt-6 animate-fade-in-delay-4 flex items-center justify-center gap-2">
          <Mic className="w-3 h-3" />
          {t('splash.requirements')}
        </p>
      </div>

      {/* Animated particles */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        {[...Array(30)].map((_, i) => (
          <div
            key={i}
            className={`absolute rounded-full animate-float ${i % 3 === 0 ? 'w-2 h-2 bg-indigo-500/40' : i % 3 === 1 ? 'w-1 h-1 bg-rose-500/30' : 'w-1.5 h-1.5 bg-emerald-500/30'}`}
            style={{
              left: `${Math.random() * 100}%`,
              top: `${Math.random() * 100}%`,
              animationDelay: `${Math.random() * 5}s`,
              animationDuration: `${5 + Math.random() * 10}s`,
            }}
          />
        ))}
      </div>

      {/* Orbiting elements */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] pointer-events-none">
        <div className="absolute inset-0 animate-orbit">
          <Sparkles className="absolute top-0 left-1/2 -translate-x-1/2 w-4 h-4 text-indigo-400/50" />
        </div>
        <div className="absolute inset-0 animate-orbit-reverse">
          <Zap className="absolute bottom-0 left-1/2 -translate-x-1/2 w-3 h-3 text-amber-400/40" />
        </div>
      </div>
    </div>
  );
};
