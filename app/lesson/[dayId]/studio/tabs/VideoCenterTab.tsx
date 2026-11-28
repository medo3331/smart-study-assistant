"use client";

import VideoCenter from "../video/VideoCenter";

/** تاب مركز الفيديو — البحث lazy جوه VideoCenter (صفر نداء عند تحميل الصفحة). */
export default function VideoCenterTab({
  subject,
  topic,
  learningStyle,
}: {
  subject: string;
  topic: string;
  learningStyle: string;
}) {
  return <VideoCenter subject={subject} lesson={topic} learningStyle={learningStyle} />;
}
