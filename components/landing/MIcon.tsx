'use client';

import styles from './MIcon.module.css';

export default function MIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="mGrad" x1="10%" y1="0%" x2="90%" y2="100%">
          <stop offset="0%" stopColor="#f2c876" />
          <stop offset="45%" stopColor="#ff4d5e" />
          <stop offset="100%" stopColor="#8a1424" />
        </linearGradient>
        <linearGradient id="sparkGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#fff6e0" />
          <stop offset="55%" stopColor="#f2c876" />
          <stop offset="100%" stopColor="#ff4d5e" />
        </linearGradient>
      </defs>
      <g transform="skewX(-9) translate(7,0)">
        <path fill="url(#mGrad)" d="M10,85 L10,15 L28,15 L50,53 L72,15 L90,15 L90,85 L76,85 L76,38 L54,72 L46,72 L24,38 L24,85 Z" />
      </g>
      <g transform="translate(79,13) rotate(10)">
        <path fill="url(#sparkGrad)" d="M0,-18 C1.2,-4 4,-1.2 18,0 C4,1.2 1.2,4 0,18 C-1.2,4 -4,1.2 -18,0 C-4,-1.2 -1.2,-4 0,-18 Z" />
      </g>
      <g transform="translate(92,32) rotate(10) scale(0.4)">
        <path fill="url(#sparkGrad)" d="M0,-18 C1.2,-4 4,-1.2 18,0 C4,1.2 1.2,4 0,18 C-1.2,4 -4,1.2 -18,0 C-4,-1.2 -1.2,-4 0,-18 Z" />
      </g>
    </svg>
  );
}
