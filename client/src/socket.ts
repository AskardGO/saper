import { io, Socket } from 'socket.io-client';
import { getToken } from './api';

export function createGameSocket(): Socket {
  return io({
    path: '/socket.io',
    auth: { token: getToken() },
    extraHeaders: {},
    transports: ['websocket', 'polling'],
  });
}
