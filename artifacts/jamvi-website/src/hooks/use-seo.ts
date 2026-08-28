import { useEffect } from 'react';
import { DEFAULT_OG_IMAGE, SITE_ORIGIN } from '@/lib/site-seo';

interface SeoProps {
  title: string;
  description: string;
  url?: string;
  image?: string;
}

export function useSeo({ 
  title, 
  description, 
  url,
  image = DEFAULT_OG_IMAGE
}: SeoProps) {
  useEffect(() => {
    document.title = `${title} | Jamvi`;
    const pageUrl = url ?? `${SITE_ORIGIN}${window.location.pathname === '/' ? '/' : window.location.pathname}`;
    
    const setMeta = (name: string, content: string, property = false) => {
      let element = document.querySelector(`meta[${property ? 'property' : 'name'}="${name}"]`);
      if (!element) {
        element = document.createElement('meta');
        element.setAttribute(property ? 'property' : 'name', name);
        document.head.appendChild(element);
      }
      element.setAttribute('content', content);
    };

    setMeta('description', description);
    setMeta('og:title', `${title} | Jamvi`, true);
    setMeta('og:description', description, true);
    setMeta('og:url', pageUrl, true);
    setMeta('og:image', image, true);
    setMeta('og:type', 'website', true);
    setMeta('twitter:card', 'summary_large_image');
    setMeta('twitter:title', `${title} | Jamvi`);
    setMeta('twitter:description', description);
    setMeta('twitter:image', image);
  }, [title, description, url, image]);
}
