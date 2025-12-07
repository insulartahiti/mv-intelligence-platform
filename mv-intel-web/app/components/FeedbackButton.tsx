'use client';

import { useState } from 'react';
import html2canvas from 'html2canvas';
import { Bug, Loader2, X, Camera } from 'lucide-react';
import { submitIssue } from '@/app/actions/issues';
import { makeBrowserClient } from '@/lib/supabaseClient';
import { usePathname } from 'next/navigation';

export default function FeedbackButton() {
  const [isOpen, setIsOpen] = useState(false);
  const [comment, setComment] = useState('');
  const [screenshot, setScreenshot] = useState<string | null>(null);
  const [isCapturing, setIsCapturing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const pathname = usePathname();
  const supabase = makeBrowserClient();

  const handleCapture = async () => {
    setIsCapturing(true);
    try {
      const canvas = await html2canvas(document.body, {
        useCORS: true, // Handle cross-origin images if possible
        ignoreElements: (element) => element.id === 'feedback-modal', // Avoid capturing the modal itself if open (though we usually close it or move it)
      });
      setScreenshot(canvas.toDataURL('image/png'));
    } catch (err) {
      console.error('Screenshot failed:', err);
      alert('Could not capture screen. You can still submit a text report.');
    } finally {
      setIsCapturing(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        alert('You must be logged in to report an issue.');
        return;
      }

      await submitIssue(screenshot, comment, pathname, user.id);
      alert('Issue reported successfully! The team will investigate.');
      setIsOpen(false);
      setComment('');
      setScreenshot(null);
    } catch (err: any) {
      console.error('Submission failed:', err);
      alert('Failed to submit report: ' + err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-4 right-4 z-[90] bg-slate-800 hover:bg-slate-700 text-slate-300 p-3 rounded-full shadow-lg border border-slate-700 transition-all hover:scale-105"
        title="Report a Bug"
      >
        <Bug size={24} />
      </button>
    );
  }

  return (
    <div id="feedback-modal" className="fixed bottom-4 right-4 z-[100] w-80 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl overflow-hidden font-sans animate-in slide-in-from-bottom-2">
      <div className="bg-slate-800/50 p-3 border-b border-slate-700 flex items-center justify-between">
        <h3 className="font-semibold text-slate-200 flex items-center gap-2">
          <Bug size={16} className="text-red-400" />
          Report Issue
        </h3>
        <button onClick={() => setIsOpen(false)} className="text-slate-400 hover:text-white">
          <X size={18} />
        </button>
      </div>

      <form onSubmit={handleSubmit} className="p-4 space-y-4">
        <div>
          <label className="block text-xs uppercase tracking-wider text-slate-500 mb-1">What happened?</label>
          <textarea
            required
            rows={3}
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-sm focus:ring-1 focus:ring-blue-500 outline-none resize-none"
            placeholder="Describe the bug or issue..."
          />
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
             <label className="block text-xs uppercase tracking-wider text-slate-500">Screenshot</label>
             {!screenshot && (
                <button
                    type="button"
                    onClick={handleCapture}
                    disabled={isCapturing}
                    className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1"
                >
                    {isCapturing ? <Loader2 size={12} className="animate-spin" /> : <Camera size={12} />}
                    Capture Screen
                </button>
             )}
          </div>
          
          {screenshot ? (
            <div className="relative group rounded-lg overflow-hidden border border-slate-700">
                <img src={screenshot} alt="Screenshot preview" className="w-full h-auto opacity-70 group-hover:opacity-100 transition-opacity" />
                <button 
                    type="button"
                    onClick={() => setScreenshot(null)}
                    className="absolute top-1 right-1 bg-black/50 text-white p-1 rounded-full hover:bg-red-500/80 transition-colors"
                >
                    <X size={12} />
                </button>
            </div>
          ) : (
            <div className="bg-slate-950/50 border border-dashed border-slate-800 rounded-lg p-4 text-center text-xs text-slate-500">
                No screenshot captured
            </div>
          )}
        </div>

        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full bg-blue-600 hover:bg-blue-500 text-white py-2 rounded-lg text-sm font-medium flex items-center justify-center gap-2"
        >
          {isSubmitting && <Loader2 size={14} className="animate-spin" />}
          Submit Report
        </button>
      </form>
    </div>
  );
}
