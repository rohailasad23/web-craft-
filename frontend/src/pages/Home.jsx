import React from 'react';
import { Link } from 'react-router-dom';

export default function Home() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-600 to-purple-700 text-white text-center px-4">
      <div>
        <h1 className="text-5xl font-bold mb-4">Landing Page Builder</h1>
        <p className="text-xl mb-8 opacity-90">AI generates it. You customize it. Clients pay for it.</p>
        <div className="flex gap-4 justify-center">
          <Link to="/register" className="bg-white text-blue-600 px-6 py-3 rounded-full font-semibold hover:opacity-90">
            Get Started
          </Link>
          <Link to="/login" className="border border-white px-6 py-3 rounded-full font-semibold hover:bg-white/10">
            Login
          </Link>
        </div>
      </div>
    </div>
  );
}
