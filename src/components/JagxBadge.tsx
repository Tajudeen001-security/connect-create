// src/components/JagxBadge.tsx
import React from 'react';

export const JagxBadge: React.FC<{ className?: string }> = ({ className = '' }) => {
  return (
    <a 
      href="https://jagx.connect" // Update with your actual URL
      target="_blank" 
      rel="noopener noreferrer"
      className={`jagx-badge jagx-badge-glow ${className}`}
      aria-label="JagX Buddy Connect - Premium Social Experience"
    >
      <span className="jagx-badge-icon">
        {/* Simple spark icon - replace with your SVG/logo */}
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5">
          <path d="M12 2L14.5 9.5L22 12L14.5 14.5L12 22L9.5 14.5L2 12L9.5 9.5L12 2Z" />
        </svg>
      </span>
      <span>JagX Buddy Connect</span>
    </a>
  );
};
