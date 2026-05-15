import { useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';

const SOCKET_URL = 'http://localhost:5000';

export default function useAttendanceRealtime(onAttendanceEvent) {
  const callbackRef = useRef(onAttendanceEvent);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    callbackRef.current = onAttendanceEvent;
  }, [onAttendanceEvent]);

  useEffect(() => {
    const socket = io(SOCKET_URL, {
      transports: ['websocket', 'polling'],
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
