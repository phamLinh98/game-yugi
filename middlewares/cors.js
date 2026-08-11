import cors from "cors";

const allowedOrigins = [
    'http://localhost:3000',
    'http://localhost:4000',
    'http://127.0.0.1:5500',
];

const corsOptions = {
    origin: (origin, callback) => {
        const isGameFrontend = origin && /^https:\/\/game-ygo-theme(?:-[a-z0-9-]+)?\.vercel\.app$/.test(origin);
        if (allowedOrigins.includes(origin) || isGameFrontend || !origin) {
            callback(null, true);
        } else {
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true, // Cần thiết khi sử dụng cookies
    methods: ['GET', 'POST', 'PUT', 'DELETE'], // Các phương thức được phép
    allowedHeaders: ['Content-Type', 'Authorization', 'Set-Cookie', 'Origin'], // Headers được phép
};

const corsMiddleware = cors(corsOptions);

export default corsMiddleware;
