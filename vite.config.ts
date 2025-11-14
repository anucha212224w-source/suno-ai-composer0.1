/// <reference types="node" />
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // โหลดไฟล์ env ตาม `mode` ในไดเรกทอรีการทำงานปัจจุบัน
  // พารามิเตอร์ที่สาม '' ทำให้ตัวแปร env ทั้งหมดพร้อมใช้งาน แม้ว่าจะไม่มีคำนำหน้า VITE_
  const env = loadEnv(mode, process.cwd(), '');

  return {
    plugins: [react()],
    resolve: {
      // Fix: Corrected 'ts' to '.ts' for proper module resolution.
      extensions: ['.mjs', '.js', '.ts', '.jsx', '.tsx', '.json'],
    },
    // ทำให้ตัวแปรสภาพแวดล้อมพร้อมใช้งานในโค้ดฝั่งไคลเอ็นต์
    define: {
      'process.env.API_KEY': JSON.stringify(env.API_KEY),
    },
  };
});
