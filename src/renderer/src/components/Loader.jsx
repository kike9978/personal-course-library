import React from 'react';
import '../assets/loader.css';

function Loader() {
  return (
    <div className="loader">
      <div className="spinner"></div>
      <p className="loading-text">Loading courses...</p>
    </div>
  );
}

export default Loader; 