import { useState } from 'react';
import Hero from '@/components/Hero';
import Login from '@/components/Login';
import Results from '@/components/Results';
import { fetchPlan } from './api';
import './index.css';

interface TravelContext {
  destination?: string;
  destination_iata?: string;
  origin?: string;
  origin_iata?: string;
  duration_days?: number;
  departure_date?: string;
  return_date?: string;
  travelers?: number;
  budget_preference?: string;
  budget_amount?: number;
}

interface TravelPlanResponse {
  status: 'complete' | 'needs_clarification' | 'error';
  message: string;
  clarification_question?: string;
  travel_context?: TravelContext;
  flights: any[];
  hotels: any[];
  weather?: any;
  budget?: any;
  itinerary?: string;
  session_context?: any;
  errors?: string[];
}

function App() {
  const [view, setView] = useState<'home' | 'login' | 'results' | 'loading' | 'clarify'>('home');
  const [originalMessage, setOriginalMessage] = useState('');
  const [response, setResponse] = useState<TravelPlanResponse | null>(null);
  const [clarificationText, setClarificationText] = useState('');
  const [sessionId, setSessionId] = useState('');
  const [apiError, setApiError] = useState<string | null>(null);

  // Trigger travel planning
  const handlePlanTrip = async (prompt: string) => {
    setView('loading');
    setOriginalMessage(prompt);
    setApiError(null);

    // Generate a unique session ID per planning session
    const sid = 'session-' + Math.random().toString(36).substring(2, 11);
    setSessionId(sid);

    try {
      const res = await fetchPlan({ message: prompt });

      if (!res.ok) {
        let msg = 'Failed to generate travel plan.';
        try {
          const errData = await res.json();
          msg = errData.detail || errData.message || (errData.errors && errData.errors[0]) || msg;
        } catch (_) {}
        throw new Error(msg);
      }

      const data: TravelPlanResponse = await res.json();
      handleBackendResponse(data);
    } catch (err: any) {
      console.error(err);
      setApiError(err.message || 'Server error occurred.');
      setView('home');
    }
  };

  // Submit clarification answer
  const handleClarifySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!clarificationText.trim() || !response) return;

    const answer = clarificationText.trim();
    setClarificationText('');
    setView('loading');

    try {
      const res = await fetchPlan({
        message: originalMessage,
        clarification_response: answer,
        session_context: response.session_context
      });

      if (!res.ok) {
        let msg = 'Failed to generate travel plan.';
        try {
          const errData = await res.json();
          msg = errData.detail || errData.message || (errData.errors && errData.errors[0]) || msg;
        } catch (_) {}
        throw new Error(msg);
      }

      const data: TravelPlanResponse = await res.json();
      handleBackendResponse(data);
    } catch (err: any) {
      console.error(err);
      setApiError(err.message || 'Server error occurred.');
      setView('home');
    }
  };

  // Handle standard plan API response
  const handleBackendResponse = (data: TravelPlanResponse) => {
    setResponse(data);
    if (data.status === 'needs_clarification') {
      setView('clarify');
    } else if (data.status === 'complete') {
      setView('results');
    } else {
      setApiError(data.message || 'An error occurred during travel generation.');
      setView('home');
    }
  };

  return (
    <div className="w-full min-h-svh bg-white print:min-h-0 print:overflow-visible print:block">
      {/* 1. HOME VIEW */}
      {view === 'home' && (
        <div className="relative">
          {/* Subtle error display banner */}
          {apiError && (
            <div className="bg-[#F3E3DA] border-b border-[#D7B7A7] text-[#6F3E32] py-3.5 px-6 text-center text-sm font-semibold select-none z-50 relative flex items-center justify-center gap-2">
              <span>⚠️</span>
              <span>{apiError}</span>
              <button 
                onClick={() => setApiError(null)} 
                className="bg-transparent border-none font-bold text-lg cursor-pointer ml-4 leading-none text-[#6F3E32]"
              >
                ×
              </button>
            </div>
          )}
          <Hero onNavigateLogin={() => setView('login')} onPlanTrip={handlePlanTrip} />
        </div>
      )}

      {/* 2. LOGIN VIEW */}
      {view === 'login' && (
        <Login onNavigateHome={() => setView('home')} />
      )}

      {/* 3. LOADING SPINNER VIEW */}
      {view === 'loading' && (
        <div className="paper-texture min-h-svh w-full flex flex-col items-center justify-center relative z-0">
          {/* Background watercolor blur */}
          <div className="absolute top-[20%] left-[20%] w-[350px] h-[350px] rounded-full bg-[#E8DDC7]/25 blur-[100px] pointer-events-none -z-10" />
          <div className="absolute bottom-[20%] right-[20%] w-[350px] h-[350px] rounded-full bg-[#D9CBB2]/20 blur-[100px] pointer-events-none -z-10" />
          
          <div className="flex flex-col items-center text-center gap-8 select-none">
            {/* Spinning Compass SVG */}
            <div className="animate-spin text-[#A85D3B] duration-1000" style={{ animationDuration: '3s' }}>
              <svg className="w-16 h-16" viewBox="0 0 100 100" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="50" cy="50" r="40" strokeDasharray="3 3" />
                <path d="M50 10 L50 90 M10 50 L90 50" />
                <polygon points="50,50 54,20 50,12 46,20" fill="currentColor" opacity="0.8" />
                <polygon points="50,50 46,80 50,88 54,80" fill="currentColor" opacity="0.3" />
              </svg>
            </div>

            <div className="flex flex-col gap-3">
              <span className="font-typewriter text-4xl font-bold tracking-tight text-[#111111]">wandor</span>
              <p className="font-display text-2xl font-medium text-[#6F6A62] italic max-w-[450px]">
                Crafting your personalized travel itinerary, recommended flights, and accommodation details...
              </p>
            </div>
          </div>
        </div>
      )}

      {/* 4. CLARIFICATION VIEW */}
      {view === 'clarify' && response && (
        <div className="paper-texture min-h-svh w-full flex flex-col items-center justify-center p-6 relative z-0">
          {/* Background blurs */}
          <div className="absolute top-[10%] left-[10%] w-[400px] h-[400px] rounded-full bg-[#E8DDC7]/25 blur-[100px] pointer-events-none -z-10" />
          
          <div className="bg-[#FBF8F1] border border-[#DED7CA] rounded-[28px] max-w-[620px] w-full p-10 max-md:p-6 shadow-[0_12px_40px_rgba(45,35,25,0.06)] flex flex-col gap-6 relative">
            <span className="text-[#A85D3B] text-[20px] font-bold select-none">✦</span>
            
            <div className="flex flex-col gap-2">
              <h2 className="font-display text-3xl font-semibold text-[#111111] leading-tight">
                Help us plan your trip.
              </h2>
              <p className="text-[15px] font-semibold text-[#A85D3B] mt-2 bg-[#F3E3DA] p-4.5 rounded-xl border border-[#D7B7A7]">
                {response.clarification_question}
              </p>
            </div>

            <form onSubmit={handleClarifySubmit} className="flex flex-col gap-4">
              <textarea
                value={clarificationText}
                onChange={(e) => setClarificationText(e.target.value)}
                placeholder="Enter details here (e.g. departing on March 24, budget of $2000, 2 travelers)..."
                className="w-full h-32 px-4 py-3 bg-[#F7F3EA] border border-[#D8D1C5] rounded-xl text-sm outline-none resize-none transition-all placeholder:text-[#A6A096] focus:border-[#111111]"
              />

              <div className="flex gap-4 items-center">
                <button
                  type="button"
                  onClick={() => setView('home')}
                  className="w-1/2 h-13 bg-transparent border border-[#D8CBB7] hover:bg-[#F2EDE4] text-xs font-semibold rounded-full text-[#514133] transition-all cursor-pointer"
                >
                  Cancel Plan
                </button>
                <button
                  type="submit"
                  disabled={!clarificationText.trim()}
                  className="w-1/2 h-13 bg-[#111111] hover:bg-[#2A2926] disabled:bg-[#8A847A] text-[#F7F3EA] text-xs font-semibold rounded-full transition-all cursor-pointer shadow-sm"
                >
                  Continue Planning
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 5. RESULTS VIEW */}
      {view === 'results' && response && (
        <Results 
          response={response} 
          onNavigateHome={() => setView('home')} 
          session_id={sessionId} 
        />
      )}
    </div>
  );
}

export default App;
