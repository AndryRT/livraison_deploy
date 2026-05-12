
import React, { useEffect, useState } from 'react';
import '../styles/Toast.css';

const Toast = ({ message, type, onClose }) => {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (message) {
      setVisible(true);
      const timer = setTimeout(() => {
        setVisible(false);
        onClose();
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [message, onClose]);

  if (!visible) return null;

  return (
    <div className={`toast toast-${type}`}>
      {message}
    </div>
  );
};

export default Toast;
