import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';

dotenv.config();

export const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (token == null) return res.sendStatus(401);

  jwt.verify(token, process.env.JWT_SECRET || 'secret', (err, user) => {
    if (err) return res.sendStatus(403);
    req.user = user;
    next();
  });
};

export const authorizeRole = (...roles) => {
  return (req, res, next) => {
    console.log(`[AUTH] User Role: ${req.user.role} | Allowed Roles: ${roles.join(', ')}`);
    
    if (!roles.includes(req.user.role) && req.user.role !== 'admin') {
      console.log(`[AUTH] Access Denied for ${req.user.role}`);
      return res.status(403).json({ message: 'Access denied' });
    }
    next();
  };
};
