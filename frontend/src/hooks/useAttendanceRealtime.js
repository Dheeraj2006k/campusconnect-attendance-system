import { useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';

function resolveSocketUrl() {
  const explicitSocketUrl = import.meta.env.VITE_SOCKET_URL?.trim();
  if (explicitSocketUrl) return explicitSocketUrl;

  const apiUrl = import.meta.env.VITE_API_URL?.trim();
  if (apiUrl) return apiUrl.replace(/\/api\/?$/, '');

  if (typeof window === 'undefined') return null;

  const isLocalHost = ['localhost', '127.0.0.1'].includes(window.location.hostname);
  return isLocalHost ? 'http://localhost:5000' : null;
}

export default function useAttendanceRealtime(onAttendanceEvent) {
  const callbackRef = useRef(onAttendanceEvent);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    callbackRef.current = onAttendanceEvent;
  }, [onAttendanceEvent]);

  useEffect(() => {
    const socketUrl = resolveSocketUrl();
    if (!socketUrl) {
      setConnected(false);
      return undefined;
    }

    const socket = io(socketUrl, {
      transports: ['websocket', 'polling'],
      reconnectionAttempts: 3,
      reconnectionDelay: 2000,
    });

    const handleAttendanceEvent = (event) => {
      callbackRef.current?.(event);
    };

    socket.on('connect', () => setConnected(true));
    socket.on('disconnect', () => setConnected(false));
    socket.on('attendance_marked', handleAttendanceEvent);
    socket.on('attendance_updated', handleAttendanceEvent);

    return () => {
      socket.off('attendance_marked', handleAttendanceEvent);
      socket.off('attendance_updated', handleAttendanceEvent);
      socket.disconnect();
    };
  }, []);

  return connected;
}
