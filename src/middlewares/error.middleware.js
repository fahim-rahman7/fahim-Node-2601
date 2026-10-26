export const errorHandler = (err, req, res, next) => {
    let statusCode = err.statusCode || 500;
    let message = err.message || 'Internal Server Error';
  
    // Mongoose: Invalid ObjectId format
    if (err.name === 'CastError') {
      statusCode = 400;
      message = `Resource not found. Invalid ${err.path}: ${err.value}`;
    }
  
    // Mongoose: Duplicate key error (e.g., duplicate email)
    if (err.code === 11000) {
      statusCode = 400;
      const field = Object.keys(err.keyValue)[0];
      message = `Duplicate field value entered for '${field}'. Please use another value.`;
    }
  
    // Mongoose: Schema validation error
    if (err.name === 'ValidationError') {
      statusCode = 400;
      message = Object.values(err.errors)
        .map((val) => val.message)
        .join(', ');
    }
  
    // JWT Errors
    if (err.name === 'JsonWebTokenError') {
      statusCode = 401;
      message = 'Invalid token. Authorization denied.';
    }
  
    if (err.name === 'TokenExpiredError') {
      statusCode = 401;
      message = 'Token has expired. Please log in again.';
    }
  
    res.status(statusCode).json({
      success: false,
      message,
      ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
    });
  };