import serverless from 'serverless-http';
import app from '../../server.ts';

// Flag Netlify environment so background server processes or watchers never run
process.env.NETLIFY = 'true';

// Initialize serverless wrapper around the full-stack Express POS app
const expressHandler = serverless(app);

export const handler = async (event: any, context: any) => {
  process.env.NETLIFY = 'true';

  // Normalize incoming request path for Express routing
  // Netlify rewrites /api/* to /.netlify/functions/api/:splat or directly invokes /.netlify/functions/api/*
  // We guarantee the path seen by Express always starts with '/api'
  if (typeof event.path === 'string') {
    if (event.path.startsWith('/.netlify/functions/api')) {
      const rest = event.path.slice('/.netlify/functions/api'.length);
      if (rest.startsWith('/api')) {
        event.path = rest;
      } else {
        event.path = '/api' + (rest.startsWith('/') ? rest : rest ? `/${rest}` : '');
      }
    } else if (!event.path.startsWith('/api')) {
      event.path = '/api' + (event.path.startsWith('/') ? event.path : `/${event.path}`);
    }
  }

  if (typeof event.rawPath === 'string') {
    if (event.rawPath.startsWith('/.netlify/functions/api')) {
      const rest = event.rawPath.slice('/.netlify/functions/api'.length);
      if (rest.startsWith('/api')) {
        event.rawPath = rest;
      } else {
        event.rawPath = '/api' + (rest.startsWith('/') ? rest : rest ? `/${rest}` : '');
      }
    } else if (!event.rawPath.startsWith('/api')) {
      event.rawPath = '/api' + (event.rawPath.startsWith('/') ? event.rawPath : `/${event.rawPath}`);
    }
  }

  return expressHandler(event, context);
};

export default handler;
