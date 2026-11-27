/**
 * ไฟล์ตั้งค่าการเชื่อมต่อ Firebase
 * ---------------------------------------------------------
 * วิธีใช้งานสำหรับมือใหม่:
 * 1. ไปที่ Firebase Console > Project Settings > General > Your apps > Web app
 * 2. คัดลอกค่าใน firebaseConfig มาแทนที่ข้อความ "YOUR_..." ด้านล่าง
 * 3. หากยังไม่ได้ตั้งค่า Firebase แอปจะทำงานใน "โหมดออฟไลน์บนเครื่อง (Local Mode)"
 *    ให้อัตโนมัติ สามารถทดลองใช้งานได้ทันที และเมื่อใส่ค่าด้านล่างครบแล้ว
 *    ระบบ Google Sign-in และซิงก์ข้อมูลข้ามอุปกรณ์จะเปิดใช้งานให้อัตโนมัติ
 */

export const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT_ID.firebasestorage.app",
  messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
  appId: "YOUR_APP_ID"
};

/**
 * ตรวจสอบว่าผู้ใช้ได้ใส่ค่า Firebase Config จริงแล้วหรือยัง
 * @returns {boolean}
 */
export function isFirebaseConfigured() {
  return Boolean(
    firebaseConfig.apiKey &&
    !firebaseConfig.apiKey.startsWith("YOUR_") &&
    firebaseConfig.projectId &&
    !firebaseConfig.projectId.startsWith("YOUR_")
  );
}
