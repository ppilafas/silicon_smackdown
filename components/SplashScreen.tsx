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
    <div className="fixed inset-0 z-50 bg-slate-950 flex flex-col items-center justify-center px-4 py-10 md:p-8 overflow-x-hidden overflow-y-auto">
      {/* Animated background glow */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-indigo-600/20 rounded-full blur-[120px] animate-pulse" />
        <div className="absolute top-1/3 left-1/3 w-[400px] h-[400px] bg-rose-500/10 rounded-full blur-[100px] animate-pulse" style={{ animationDelay: '1s' }} />
        <div className="absolute bottom-1/3 right-1/3 w-[300px] h-[300px] bg-emerald-500/10 rounded-full blur-[80px] animate-pulse" style={{ animationDelay: '2s' }} />
      </div>

      {/* Content */}
      <div className="relative z-10 text-center max-w-6xl w-full px-4">
        {/* Animated icon cluster above hero */}
        <div className="flex items-center justify-center gap-6 mb-10 animate-fade-in">
          <Zap className="w-5 h-5 text-amber-400 animate-zap" />
          <Radio className="w-7 h-7 text-indigo-400 animate-radio-pulse" />
          <Zap className="w-5 h-5 text-amber-400 animate-zap" style={{ animationDelay: '0.5s' }} />
        </div>

        {/* Hero Logo - Large Centerpiece */}
        <div className="mb-6 animate-fade-in flex justify-center relative">
          <div className="absolute inset-0 bg-indigo-500/20 blur-[100px] rounded-full" />
          <img 
            src="/big_hero_logo.png" 
            alt="Silicon Smackdown" 
            className="relative w-72 sm:w-96 md:w-[28rem] lg:w-[32rem] h-auto object-contain drop-shadow-[0_0_80px_rgba(139,92,246,0.6)] hover:drop-shadow-[0_0_100px_rgba(139,92,246,0.8)] transition-all duration-500"
          />
        </div>

        {/* Subtitle */}
        <p className="text-slate-300 text-[11px] sm:text-xs md:text-sm uppercase tracking-[0.35em] mb-6 animate-fade-in-delay-1 flex items-center justify-center gap-2 font-medium">
          <Sparkles className="w-3.5 h-3.5 text-indigo-400 animate-sparkle" />
          {t('splash.subtitle')}
          <Sparkles className="w-3.5 h-3.5 text-indigo-400 animate-sparkle" style={{ animationDelay: '0.3s' }} />
        </p>

        {/* Tagline */}
        <p className="text-lg sm:text-xl md:text-2xl text-slate-200 mb-8 leading-relaxed animate-fade-in-delay-2 max-w-3xl mx-auto font-light">
          {t('splash.tagline')}
          <br />
          <span className="text-indigo-400 font-normal">{t('splash.taglineHighlight')}</span>
        </p>

        {/* Enter button */}
        <div className="flex flex-col items-center gap-5 animate-fade-in-delay-4 mb-8">
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
                className="w-full rounded-full bg-slate-900/60 backdrop-blur-sm border border-slate-700/50 px-6 py-3.5 text-sm text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-indigo-500 focus:bg-slate-900/80 transition-all"
              />
              {error && (
                <p className="mt-2 text-xs text-rose-400 text-center">{error}</p>
              )}
            </div>
          )}
          <button
            onClick={handleEnter}
            className="group relative px-12 sm:px-16 py-4 sm:py-5 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-bold uppercase tracking-[0.2em] text-xs sm:text-sm rounded-full transition-all shadow-[0_0_40px_rgba(99,102,241,0.4)] hover:shadow-[0_0_60px_rgba(99,102,241,0.6)] active:scale-95 overflow-hidden"
          >
          <span className="relative z-10 flex items-center gap-3">
            <Zap className="w-4 h-4 animate-zap" />
            {t('splash.enterButton')}
            <Zap className="w-4 h-4 animate-zap" style={{ animationDelay: '0.3s' }} />
          </span>
          <div className="absolute inset-0 bg-gradient-to-r from-purple-600 via-indigo-500 to-purple-600 opacity-0 group-hover:opacity-100 transition-opacity duration-500 animate-gradient-shift" />
          </button>
        </div>

        <p className="text-slate-500 text-[10px] sm:text-xs mb-10 animate-fade-in-delay-4 flex items-center justify-center gap-2 font-medium">
          <Mic className="w-3 h-3 opacity-60" />
          {t('splash.requirements')}
        </p>

        {/* Features - Animated Ticker */}
        <div className="relative w-full mb-10 animate-fade-in-delay-3 overflow-hidden">
          <div className="flex animate-ticker">
            {/* First set of features */}
            <div className="flex items-center gap-6 flex-shrink-0 pr-6">
              <div className="group flex items-center gap-3 bg-slate-900/40 backdrop-blur-sm border border-slate-700/50 rounded-full px-5 py-3 hover:border-indigo-500/60 hover:bg-slate-900/60 transition-all duration-300 cursor-default whitespace-nowrap">
                <div className="relative w-9 h-9 flex items-center justify-center flex-shrink-0">
                  <div className="absolute inset-0 bg-indigo-500/20 rounded-full" />
                  <Mic className="w-5 h-5 text-indigo-400 relative z-10" />
                </div>
                <div className="text-left">
                  <span className="text-white font-semibold text-sm">{t('splash.features.liveVoiceAI.title')}</span>
                  <span className="text-slate-400 text-xs ml-2">{t('splash.features.liveVoiceAI.description')}</span>
                </div>
              </div>
              <div className="group flex items-center gap-3 bg-slate-900/40 backdrop-blur-sm border border-slate-700/50 rounded-full px-5 py-3 hover:border-rose-500/60 hover:bg-slate-900/60 transition-all duration-300 cursor-default whitespace-nowrap">
                <div className="relative w-9 h-9 flex items-center justify-center flex-shrink-0">
                  <div className="absolute inset-0 bg-rose-500/20 rounded-full" />
                  <Swords className="w-5 h-5 text-rose-400 relative z-10" />
                </div>
                <div className="text-left">
                  <span className="text-white font-semibold text-sm">{t('splash.features.epicRivalries.title')}</span>
                  <span className="text-slate-400 text-xs ml-2">{t('splash.features.epicRivalries.description')}</span>
                </div>
              </div>
              <div className="group flex items-center gap-3 bg-slate-900/40 backdrop-blur-sm border border-slate-700/50 rounded-full px-5 py-3 hover:border-emerald-500/60 hover:bg-slate-900/60 transition-all duration-300 cursor-default whitespace-nowrap">
                <div className="relative w-9 h-9 flex items-center justify-center flex-shrink-0">
                  <div className="absolute inset-0 bg-emerald-500/20 rounded-full" />
                  <Target className="w-5 h-5 text-emerald-400 relative z-10" />
                </div>
                <div className="text-left">
                  <span className="text-white font-semibold text-sm">{t('splash.features.youModerate.title')}</span>
                  <span className="text-slate-400 text-xs ml-2">{t('splash.features.youModerate.description')}</span>
                </div>
              </div>
            </div>
            {/* Duplicate set for seamless loop */}
            <div className="flex items-center gap-6 flex-shrink-0 pr-6">
              <div className="group flex items-center gap-3 bg-slate-900/40 backdrop-blur-sm border border-slate-700/50 rounded-full px-5 py-3 hover:border-indigo-500/60 hover:bg-slate-900/60 transition-all duration-300 cursor-default whitespace-nowrap">
                <div className="relative w-9 h-9 flex items-center justify-center flex-shrink-0">
                  <div className="absolute inset-0 bg-indigo-500/20 rounded-full" />
                  <Mic className="w-5 h-5 text-indigo-400 relative z-10" />
                </div>
                <div className="text-left">
                  <span className="text-white font-semibold text-sm">{t('splash.features.liveVoiceAI.title')}</span>
                  <span className="text-slate-400 text-xs ml-2">{t('splash.features.liveVoiceAI.description')}</span>
                </div>
              </div>
              <div className="group flex items-center gap-3 bg-slate-900/40 backdrop-blur-sm border border-slate-700/50 rounded-full px-5 py-3 hover:border-rose-500/60 hover:bg-slate-900/60 transition-all duration-300 cursor-default whitespace-nowrap">
                <div className="relative w-9 h-9 flex items-center justify-center flex-shrink-0">
                  <div className="absolute inset-0 bg-rose-500/20 rounded-full" />
                  <Swords className="w-5 h-5 text-rose-400 relative z-10" />
                </div>
                <div className="text-left">
                  <span className="text-white font-semibold text-sm">{t('splash.features.epicRivalries.title')}</span>
                  <span className="text-slate-400 text-xs ml-2">{t('splash.features.epicRivalries.description')}</span>
                </div>
              </div>
              <div className="group flex items-center gap-3 bg-slate-900/40 backdrop-blur-sm border border-slate-700/50 rounded-full px-5 py-3 hover:border-emerald-500/60 hover:bg-slate-900/60 transition-all duration-300 cursor-default whitespace-nowrap">
                <div className="relative w-9 h-9 flex items-center justify-center flex-shrink-0">
                  <div className="absolute inset-0 bg-emerald-500/20 rounded-full" />
                  <Target className="w-5 h-5 text-emerald-400 relative z-10" />
                </div>
                <div className="text-left">
                  <span className="text-white font-semibold text-sm">{t('splash.features.youModerate.title')}</span>
                  <span className="text-slate-400 text-xs ml-2">{t('splash.features.youModerate.description')}</span>
                </div>
              </div>
            </div>
          </div>
          {/* Gradient fade edges */}
          <div className="absolute inset-y-0 left-0 w-32 bg-gradient-to-r from-slate-950 to-transparent pointer-events-none" />
          <div className="absolute inset-y-0 right-0 w-32 bg-gradient-to-l from-slate-950 to-transparent pointer-events-none" />
        </div>

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
