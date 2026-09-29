// Точка входа страницы /staff: касса и админ-панель в браузере (вход по логину и паролю)
import React from 'react';
import { createRoot } from 'react-dom/client';
import { StaffApp } from './staff.jsx';

createRoot(document.getElementById('root')).render(<StaffApp />);
