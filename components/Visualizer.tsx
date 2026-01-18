import React, { useEffect, useRef } from 'react';

interface VisualizerProps {
  isActive: boolean;
  color: string;
  analyserNode?: AnalyserNode | null;
}

export const Visualizer: React.FC<VisualizerProps> = ({ isActive, color, analyserNode }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const barsRef = useRef<number[]>(new Array(20).fill(0));

  useEffect(() => {
    if (!canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrame: number;
    const bars = 20;
    const smoothing = 0.3;

    const render = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const barWidth = canvas.width / bars;
      
      if (isActive && analyserNode) {
        const dataArray = new Uint8Array(analyserNode.frequencyBinCount);
        analyserNode.getByteFrequencyData(dataArray);
        
        const step = Math.floor(dataArray.length / bars);
        for (let i = 0; i < bars; i++) {
          const value = dataArray[i * step] / 255;
          barsRef.current[i] = barsRef.current[i] * (1 - smoothing) + value * smoothing;
          const height = barsRef.current[i] * canvas.height * 0.9;
          ctx.fillStyle = color;
          ctx.fillRect(i * barWidth + 2, canvas.height - height, barWidth - 4, height);
        }
      } else if (isActive) {
        for (let i = 0; i < bars; i++) {
          const targetHeight = Math.random() * 0.8;
          barsRef.current[i] = barsRef.current[i] * 0.7 + targetHeight * 0.3;
          const height = barsRef.current[i] * canvas.height;
          ctx.fillStyle = color;
          ctx.fillRect(i * barWidth + 2, canvas.height - height, barWidth - 4, height);
        }
      } else {
        for (let i = 0; i < bars; i++) {
          barsRef.current[i] *= 0.9;
          const height = Math.max(2, barsRef.current[i] * canvas.height);
          ctx.fillStyle = color;
          ctx.fillRect(i * barWidth + 2, canvas.height - height, barWidth - 4, height);
        }
      }
      
      animationFrame = requestAnimationFrame(render);
    };

    render();
    return () => cancelAnimationFrame(animationFrame);
  }, [isActive, color, analyserNode]);

  return (
    <canvas 
      ref={canvasRef} 
      width={120} 
      height={40} 
      className={`opacity-60 transition-opacity duration-300 ${isActive ? 'opacity-100' : 'opacity-20'}`}
    />
  );
};
