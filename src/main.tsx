import React from 'react';
import {createRoot} from 'react-dom/client';
import Experience from './experience';
if(new URLSearchParams(location.search).get('ambiente')==='operacao')document.querySelector('link[rel="manifest"]')?.setAttribute('href','./manifest-operacao.webmanifest');
createRoot(document.getElementById('root')!).render(<Experience/>);
