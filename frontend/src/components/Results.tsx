import React, { useState, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import { 
  ArrowLeft, 
  Calendar, 
  MapPin, 
  Compass, 
  Plane, 
  Hotel, 
  CloudSun, 
  Send,
  MessageSquare,
  Sparkles,
  ChevronDown,
  Bell,
  User,
  ArrowRightLeft,
  ArrowRight,
  TrendingUp,
  AlertTriangle,
  Download,
  FileDown
} from 'lucide-react';

interface FlightOption {
  airline?: string;
  departure_airport?: string;
  arrival_airport?: string;
  departure_time?: string;
  arrival_time?: string;
  duration?: string;
  stops?: number;
  price?: number;
  currency?: string;
  booking_link?: string;
}

interface HotelOption {
  name?: string;
  location?: string;
  price_per_night?: number;
  total_price?: number;
  rating?: number;
  review_count?: number;
  amenities?: string[];
  booking_link?: string;
}

interface WeatherForecast {
  location: string;
  summary?: string;
  daily?: Array<{
    date?: string;
    temp_day?: number;
    temp_min?: number;
    temp_max?: number;
    condition?: string;
    description?: string;
    humidity?: number;
    wind_speed?: number;
  }>;
}

interface BudgetEstimate {
  flights?: number;
  accommodation?: number;
  activities?: number;
  food?: number;
  local_transport?: number;
  total?: number;
  currency?: string;
  notes?: string;
}

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
  travel_context?: TravelContext;
  flights: FlightOption[];
  hotels: HotelOption[];
  weather?: WeatherForecast;
  budget?: BudgetEstimate;
  itinerary?: string;
}

interface ResultsProps {
  response: TravelPlanResponse;
  onNavigateHome: () => void;
  session_id: string;
}

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

function cleanItineraryMarkdown(raw?: string): string {
  if (!raw) return '';
  // Split single-line concatenated tables (e.g. `| |`) into proper linebreaks
  const text = raw.replace(/\|\s*\|\s*/g, '|\n|');
  
  const lines = text.split('\n');
  const cleaned: string[] = [];
  const tableBuffer: string[] = [];
  let inTable = false;

  const flushTable = (tbl: string[]) => {
    if (!tbl.length) return;
    const rows: string[][] = [];
    for (const line of tbl) {
      if (/^\s*\|?[\s\-:]+(\|[\s\-:]+)+\|?\s*$/.test(line)) continue;
      const cells = line.split('|').map(c => c.trim());
      if (cells.length && !cells[0]) cells.shift();
      if (cells.length && !cells[cells.length - 1]) cells.pop();
      if (cells.length) rows.push(cells);
    }
    if (!rows.length) return;
    const header = rows[0];
    const dataRows = rows.slice(1);
    for (const r of dataRows) {
      if (!r.length) continue;
      const title = r[0];
      const subtitle = (r.length > 1 && header.length > 1 && /(location|neighborhood|route|airline)/i.test(header[1]))
        ? ` (${r[1]})` : '';
      cleaned.push(`- **${title}**${subtitle}`);
      const startIdx = subtitle ? 2 : 1;
      for (let i = startIdx; i < r.length; i++) {
        const col = header[i] || `Detail ${i + 1}`;
        if (r[i]) cleaned.push(`  - **${col}:** ${r[i]}`);
      }
      cleaned.push('');
    }
  };

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
      tableBuffer.push(trimmed);
      inTable = true;
    } else {
      if (inTable) {
        flushTable(tableBuffer);
        tableBuffer.length = 0;
        inTable = false;
      }
      cleaned.push(line);
    }
  }
  if (inTable) flushTable(tableBuffer);

  return cleaned.join('\n')
    .replace(/\|[\s\-:]+\|/g, '')
    .replace(/^\s*\|\s*/gm, '')
    .replace(/\s*\|\s*$/gm, '')
    .replace(/\s*\|\s*/g, ' — ');
}

export const Results: React.FC<ResultsProps> = ({ response, onNavigateHome, session_id }) => {
  const [activeTab, setActiveTab] = useState<'itinerary' | 'flights' | 'hotels' | 'weather'>('itinerary');
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [isChatLoading, setIsChatLoading] = useState(false);
  const chatBottomRef = useRef<HTMLDivElement>(null);

  // Auto-scroll chat to bottom
  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages, isChatOpen]);

  // Initialize Chat Session in Vector DB on load
  useEffect(() => {
    if (response.itinerary) {
      fetch('/chat/init', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: session_id,
          itinerary_text: response.itinerary
        })
      })
      .then(res => res.json())
      .then(() => {
        setChatMessages([
          { role: 'assistant', content: "Hi! I am your Wandor Assistant. Ask me any questions about your generated itinerary, hotels, or flights!" }
        ]);
      })
      .catch(err => {
        console.error("Failed to initialize chat session", err);
      });
    }
  }, [response.itinerary, session_id]);

  const handleChatSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim() || isChatLoading) return;

    const userText = chatInput.trim();
    setChatInput('');
    setChatMessages(prev => [...prev, { role: 'user', content: userText }]);
    setIsChatLoading(true);

    try {
      const chatRes = await fetch('/chat/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: session_id,
          query: userText
        })
      });

      if (!chatRes.ok) {
        throw new Error("Chat query failed.");
      }

      setChatMessages(prev => [...prev, { role: 'assistant', content: '' }]);
      setIsChatLoading(false);

      const reader = chatRes.body?.getReader();
      const decoder = new TextDecoder();
      let done = false;
      let replyAccum = '';

      while (!done && reader) {
        const { value, done: doneReading } = await reader.read();
        done = doneReading;
        if (value) {
          const chunk = decoder.decode(value);
          replyAccum += chunk;
          setChatMessages(prev => {
            const updated = [...prev];
            if (updated.length > 0) {
              updated[updated.length - 1] = {
                role: 'assistant',
                content: replyAccum
              };
            }
            return updated;
          });
        }
      }
    } catch (error) {
      console.error(error);
      setChatMessages(prev => [
        ...prev,
        { role: 'assistant', content: "Sorry, I couldn't process that query. Please make sure the backend is active." }
      ]);
      setIsChatLoading(false);
    }
  };

  const context = response.travel_context || {};
  const originLabel = context.origin || 'Delhi';
  const destLabel = context.destination || 'Tokyo';
  
  // Format departure / return dates
  const formatTravelDate = (dateStr?: string) => {
    if (!dateStr) return '';
    try {
      const date = new Date(dateStr);
      if (isNaN(date.getTime())) return dateStr;
      return date.toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric' });
    } catch {
      return dateStr;
    }
  };

  const departDateFormatted = formatTravelDate(context.departure_date) || 'September 25, 2026';
  const returnDateFormatted = formatTravelDate(context.return_date) || 'September 30, 2026';
  const isRoundTrip = !!context.return_date;

  const handleDownloadPDF = () => {
    const originalTitle = document.title;
    const cleanDest = (context.destination || 'Travel').replace(/[^a-zA-Z0-9]/g, '-');
    document.title = `Wandor-Itinerary-${cleanDest}`;

    if (activeTab !== 'itinerary') {
      setActiveTab('itinerary');
      setTimeout(() => {
        window.print();
        document.title = originalTitle;
      }, 250);
    } else {
      window.print();
      setTimeout(() => {
        document.title = originalTitle;
      }, 500);
    }
  };

  return (
    <div 
      className="min-h-svh w-full relative overflow-x-hidden flex flex-col z-0 select-text font-body text-[#111111] pb-48 print:min-h-0 print:pb-0 print:overflow-visible print:block print:static print:bg-none print:bg-white"
      style={{
        backgroundImage: "url('/bg_journal.jpg')",
        backgroundSize: 'cover',
        backgroundPosition: 'center top',
        backgroundAttachment: 'fixed',
        backgroundRepeat: 'no-repeat'
      }}
    >      {/* HEADER NAVBAR */}
      <nav className="print:hidden relative z-10 flex items-center justify-between px-20 pt-6 pb-4 max-md:px-6 max-md:pt-5 w-full">
        {/* Left branding logo */}
        <span 
          onClick={onNavigateHome} 
          className="font-typewriter text-[32px] max-md:text-[28px] font-bold text-[#111111] leading-none select-none cursor-pointer tracking-tight"
        >
          wandor
        </span>

        {/* Right user avatar segment */}
        <div className="flex items-center gap-6 select-none">
          <div className="flex items-center gap-2 cursor-pointer hover:opacity-85 transition-opacity">
            <span className="text-[13px] font-semibold text-[#111111]">Hi, Ajmal</span>
            <ChevronDown className="w-3.5 h-3.5 text-[#111111]" />
          </div>
          <button className="bg-transparent border-none p-1 cursor-pointer hover:opacity-75 transition-opacity relative">
            <Bell className="w-5 h-5 text-[#111111]" />
            <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 bg-[#A85D3B] rounded-full" />
          </button>
          <div className="w-9 h-9 rounded-full bg-[#E8DDC7] border border-[#D8D1C5] flex items-center justify-center cursor-pointer overflow-hidden">
            <User className="w-4.5 h-4.5 text-[#514133]" />
          </div>
        </div>
      </nav>

      {/* TOP HEADER */}
      <header className="print:hidden px-20 max-md:px-6 max-w-[1450px] w-full mx-auto mt-6 relative z-10 flex flex-col items-start gap-4">
        {/* Back button */}
        <button 
          onClick={onNavigateHome} 
          className="bg-transparent border-none flex items-center gap-2 text-xs font-semibold text-[#6F6A62] hover:text-[#111111] cursor-pointer transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Back to planner
        </button>

        {/* Journey Heading */}
        <div className="flex items-center justify-between w-full relative min-h-[140px] max-md:flex-col max-md:items-start gap-6">
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2 text-[13px] font-semibold text-[#6F6A62]">
              <Calendar className="w-4 h-4 text-[#A85D3B]" /> {departDateFormatted}
            </div>
            <h1 className="font-display text-[48px] max-md:text-[36px] font-semibold text-[#111111] leading-[1.1] tracking-tight">
              Here's your journey<br />crafted for you.
            </h1>
          </div>

          {/* Download PDF Action Button */}
          {response.itinerary && (
            <button
              onClick={handleDownloadPDF}
              className="flex items-center gap-2.5 px-6 py-3.5 bg-[#111111] hover:bg-[#2A2926] text-[#F7F3EA] text-sm font-semibold rounded-full transition-all duration-200 shadow-md active:scale-95 cursor-pointer border border-[#111111] group select-none whitespace-nowrap"
              title="Download Itinerary as an offline PDF"
            >
              <FileDown className="w-4.5 h-4.5 text-[#A85D3B] group-hover:translate-y-0.5 transition-transform" />
              <span>Download PDF Itinerary</span>
            </button>
          )}
        </div>
      </header>

      {/* TRIP INFORMATION CARD */}
      <section className="print:hidden px-20 max-md:px-6 max-w-[1450px] w-full mx-auto mt-6 relative z-10">
        <div className="bg-[#FBF8F1] border border-[#DED7CA] rounded-3xl p-6 shadow-[0_4px_24px_rgba(40,32,20,0.03)]">
          <div className="flex flex-col gap-5">
            {/* Trip Type Selectors */}
            <div className="flex items-center border-b border-[#E7E1D7] pb-3 text-sm font-semibold select-none">
              <span className="text-[#A85D3B] pb-2 relative font-bold tracking-wide uppercase text-xs">
                Round trip
                <span className="absolute bottom-0 left-0 w-full h-[2px] bg-[#A85D3B]" />
              </span>
            </div>

            {/* Form Fields Display Row */}
            <div className="grid grid-cols-12 gap-6 items-center text-sm font-semibold">
              {/* Origin */}
              <div className="col-span-2 max-md:col-span-12 flex flex-col gap-1">
                <span className="text-[11px] uppercase tracking-wider text-[#8A847A]">From</span>
                <div className="text-[15px] text-[#111111]">{originLabel}</div>
              </div>

              {/* Swap indicator */}
              <div className="col-span-1 max-md:hidden flex justify-center text-[#8A847A]">
                <ArrowRightLeft className="w-4 h-4 text-[#A85D3B]" />
              </div>

              {/* Destination */}
              <div className="col-span-2 max-md:col-span-12 flex flex-col gap-1">
                <span className="text-[11px] uppercase tracking-wider text-[#8A847A]">To</span>
                <div className="text-[15px] text-[#111111]">{destLabel}</div>
              </div>

              {/* Depart Date */}
              <div className="col-span-3 max-md:col-span-6 flex flex-col gap-1 border-l border-[#E7E1D7] pl-4 max-md:border-none max-md:pl-0">
                <span className="text-[11px] uppercase tracking-wider text-[#8A847A]">Depart</span>
                <div className="text-[14px] text-[#111111] flex items-center gap-1.5 whitespace-nowrap">
                  <Calendar className="w-3.5 h-3.5 text-[#A85D3B]" /> {departDateFormatted}
                </div>
              </div>

              {/* Arrow */}
              <div className="col-span-1 max-md:hidden flex justify-center text-[#8A847A]">
                <ArrowRight className="w-3.5 h-3.5" />
              </div>

              {/* Return Date */}
              <div className="col-span-3 max-md:col-span-6 flex flex-col gap-1 border-l border-[#E7E1D7] pl-4 max-md:border-none max-md:pl-0">
                <span className="text-[11px] uppercase tracking-wider text-[#8A847A]">Return</span>
                <div className="text-[14px] text-[#111111] flex items-center gap-1.5 whitespace-nowrap">
                  {isRoundTrip ? (
                    <>
                      <Calendar className="w-3.5 h-3.5 text-[#A85D3B]" /> {returnDateFormatted}
                    </>
                  ) : (
                    <span className="text-[#8A847A] font-medium italic">N/A</span>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* TAB NAVIGATION */}
      <section className="print:hidden px-20 max-md:px-6 max-w-[1450px] w-full mx-auto mt-8 relative z-10 flex gap-4 select-none overflow-x-auto pb-2 scrollbar-none">
        {/* Itinerary Tab */}
        <button
          onClick={() => setActiveTab('itinerary')}
          className={`flex items-center gap-2 px-5 py-3.5 rounded-full text-[13px] font-semibold uppercase tracking-wider transition-all cursor-pointer ${
            activeTab === 'itinerary'
              ? 'bg-[#111111] text-[#F7F3EA] shadow-sm'
              : 'bg-[#FBF8F1] border border-[#E0D8CA] text-[#514133] hover:bg-[#F2EDE4]'
          }`}
        >
          <Compass className={`w-4 h-4 ${activeTab === 'itinerary' ? 'text-[#A85D3B]' : 'text-[#8A847A]'}`} />
          Itinerary
        </button>

        {/* Flights Tab */}
        <button
          onClick={() => setActiveTab('flights')}
          className={`flex items-center gap-2 px-5 py-3.5 rounded-full text-[13px] font-semibold uppercase tracking-wider transition-all cursor-pointer ${
            activeTab === 'flights'
              ? 'bg-[#111111] text-[#F7F3EA] shadow-sm'
              : 'bg-[#FBF8F1] border border-[#E0D8CA] text-[#514133] hover:bg-[#F2EDE4]'
          }`}
        >
          <Plane className={`w-4 h-4 ${activeTab === 'flights' ? 'text-[#A85D3B]' : 'text-[#8A847A]'}`} />
          Flights
        </button>

        {/* Hotels Tab */}
        <button
          onClick={() => setActiveTab('hotels')}
          className={`flex items-center gap-2 px-5 py-3.5 rounded-full text-[13px] font-semibold uppercase tracking-wider transition-all cursor-pointer ${
            activeTab === 'hotels'
              ? 'bg-[#111111] text-[#F7F3EA] shadow-sm'
              : 'bg-[#FBF8F1] border border-[#E0D8CA] text-[#514133] hover:bg-[#F2EDE4]'
          }`}
        >
          <Hotel className={`w-4 h-4 ${activeTab === 'hotels' ? 'text-[#A85D3B]' : 'text-[#8A847A]'}`} />
          Hotels
        </button>

        {/* Weather Tab */}
        <button
          onClick={() => setActiveTab('weather')}
          className={`flex items-center gap-2 px-5 py-3.5 rounded-full text-[13px] font-semibold uppercase tracking-wider transition-all cursor-pointer ${
            activeTab === 'weather'
              ? 'bg-[#111111] text-[#F7F3EA] shadow-sm'
              : 'bg-[#FBF8F1] border border-[#E0D8CA] text-[#514133] hover:bg-[#F2EDE4]'
          }`}
        >
          <CloudSun className={`w-4 h-4 ${activeTab === 'weather' ? 'text-[#A85D3B]' : 'text-[#8A847A]'}`} />
          Weather
        </button>
      </section>

      {/* MAIN CONTENT DISPLAY AREA */}
      <section className="px-20 max-md:px-6 max-w-[1450px] w-full mx-auto mt-6 relative z-10 flex-grow print:p-0 print:m-0 print:max-w-full print:w-full print:block">
        
        {/* ==================== FLIGHTS TAB CONTENT ==================== */}
        {activeTab === 'flights' && (
          <div className="bg-[#FBF8F1] border border-[#DED7CA] rounded-[28px] p-9 max-md:p-6 shadow-[0_8px_32px_rgba(40,32,20,0.03)] flex flex-col gap-6">
            {/* Flights Header */}
            <div className="flex items-center gap-2.5 pb-2 border-b border-[#E7E1D7]">
              <Plane className="w-5 h-5 text-[#A85D3B] transform rotate-45" />
              <h2 className="font-display text-[26px] font-semibold text-[#111111]">
                Recommended flights
              </h2>
            </div>

            {/* Flight rows container */}
            <div className="flex flex-col">
              {!response.flights || response.flights.length === 0 ? (
                <div className="py-12 text-center flex flex-col items-center gap-3">
                  <AlertTriangle className="w-10 h-10 text-[#B86B47] opacity-80" />
                  <p className="font-semibold text-lg text-[#111111]">No flights found for this journey.</p>
                  <p className="text-sm text-[#6F6A62] max-w-[400px]">
                    We couldn't retrieve flight recommendations from SerpAPI right now. Please verify your origin/destination parameters or try again.
                  </p>
                  <button 
                    onClick={onNavigateHome}
                    className="mt-2 bg-transparent border border-[#D8CBB7] hover:bg-[#F2EDE4] text-xs font-semibold px-4 py-2 rounded-full cursor-pointer text-[#514133]"
                  >
                    Adjust Planner Input
                  </button>
                </div>
              ) : (
                response.flights.map((flight, idx) => {
                  const departTime = flight.departure_time || '08:45 AM';
                  const arrivalTime = flight.arrival_time || '10:00 AM';
                  const formatDuration = (durStr?: string) => {
                    if (!durStr) return '1h 15m';
                    if (durStr.includes('h') || durStr.includes('m')) return durStr;
                    const totalMin = parseInt(durStr, 10);
                    if (isNaN(totalMin)) return durStr;
                    const hrs = Math.floor(totalMin / 60);
                    const mins = totalMin % 60;
                    return mins > 0 ? `${hrs}h ${mins}m` : `${hrs}h`;
                  };
                  const duration = formatDuration(flight.duration);
                  const stopsText = flight.stops === 0 ? 'Non-stop' : (flight.stops ? `${flight.stops} Stop${flight.stops > 1 ? 's' : ''}` : '');
                  const priceText = flight.price ? `₹${flight.price.toLocaleString('en-IN')}` : '₹15,000';
                  
                  return (
                    <div 
                      key={idx}
                      className={`grid grid-cols-12 gap-6 items-center py-6 border-b border-[#E7E1D7] transition-all hover:bg-[#F7F3EA]/50 px-4 rounded-xl -mx-4 ${
                        idx === response.flights.length - 1 ? 'border-none' : ''
                      }`}
                    >
                      {/* Departure info */}
                      <div className="col-span-2 max-md:col-span-12 flex flex-col gap-1">
                        <span className="text-[17px] font-bold text-[#111111]">{departTime}</span>
                        <span className="text-[12px] font-semibold text-[#8A847A]">
                          {flight.departure_airport || 'Paris (PAR)'}
                        </span>
                      </div>

                      {/* Travel dotted connector */}
                      <div className="col-span-3 max-md:col-span-12 flex flex-col items-center gap-1 select-none">
                        <span className="text-[11px] font-semibold text-[#8A847A]">{duration}</span>
                        <div className="flex items-center w-full gap-2 text-[#CBBCA4]">
                          <span className="w-1.5 h-1.5 rounded-full border border-[#CBBCA4]" />
                          <div className="flex-grow border-t border-dashed border-[#CBBCA4]" />
                          <Plane className="w-3.5 h-3.5 transform rotate-90 text-[#A85D3B]" />
                          <div className="flex-grow border-t border-dashed border-[#CBBCA4]" />
                          <span className="w-1.5 h-1.5 rounded-full border border-[#CBBCA4]" />
                        </div>
                        {stopsText && <span className="text-[11px] font-semibold text-[#8A847A]">{stopsText}</span>}
                      </div>

                      {/* Arrival info */}
                      <div className="col-span-3 max-md:col-span-12 flex flex-col gap-1 max-md:items-start pl-4 max-md:pl-0">
                        <span className="text-[17px] font-bold text-[#111111]">{arrivalTime}</span>
                        <span className="text-[12px] font-semibold text-[#8A847A]">
                          {flight.arrival_airport || 'Zurich (ZRH)'}
                        </span>
                      </div>

                      {/* Airline */}
                      <div className="col-span-2 max-md:col-span-6 flex flex-col gap-1">
                        <span className="text-[15px] font-bold text-[#111111]">{flight.airline || 'IndiGo'}</span>
                      </div>

                      {/* Price */}
                      <div className="col-span-2 max-md:col-span-6 text-right max-md:text-left font-bold text-[20px] text-[#111111]">
                        {priceText}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Bottom outline button */}
            {response.flights && response.flights.length > 0 && (
              <div className="flex justify-center pt-2">
                <button 
                  onClick={() => alert("Redirecting to SerpAPI Google Flights to view full search listings...")}
                  className="bg-transparent border border-[#D8CBB7] hover:bg-[#F2EDE4] text-xs font-semibold px-8 py-3 rounded-full cursor-pointer text-[#514133] transition-colors active:scale-95"
                >
                  View all flights
                </button>
              </div>
            )}
          </div>
        )}

        {/* ==================== ITINERARY TAB CONTENT ==================== */}
        {activeTab === 'itinerary' && response.itinerary && (
          <div className="bg-[#FBF8F1] border border-[#DED7CA] rounded-[28px] p-9 max-md:p-6 shadow-[0_8px_32px_rgba(40,32,20,0.03)] flex flex-col gap-6 print:bg-transparent print:border-none print:p-0 print:shadow-none print:rounded-none print:block">
            <div className="print:hidden flex items-center justify-between pb-2 border-b border-[#E7E1D7] select-none">
              <div className="flex items-center gap-2.5">
                <Compass className="w-5 h-5 text-[#A85D3B]" />
                <h2 className="font-display text-[26px] font-semibold text-[#111111]">
                  Your personalized travel plan
                </h2>
              </div>
              <button
                onClick={handleDownloadPDF}
                className="bg-[#F7F3EA] border border-[#D8CBB7] hover:bg-[#F2EDE4] text-xs font-semibold px-4 py-2.5 rounded-full cursor-pointer text-[#514133] transition-colors active:scale-95 flex items-center gap-2 group shadow-2xs select-none"
                title="Download Itinerary as an offline PDF"
              >
                <Download className="w-3.5 h-3.5 text-[#A85D3B] group-hover:translate-y-0.5 transition-transform" />
                <span>Download PDF</span>
              </button>
            </div>
            
            <div className="printable-itinerary flex flex-col gap-6 bg-transparent">
              <div className="hidden print:block border-b border-[#DED7CA] pb-4 mb-2">
                <div className="flex justify-between items-center text-xs text-[#8A847A] font-semibold uppercase tracking-wider mb-2">
                  <span>WandorAI Personalized Travel Plan</span>
                  <span>Generated Itinerary</span>
                </div>
                <h1 className="font-display text-[32px] font-bold text-black leading-tight">
                  {originLabel} to {destLabel}
                </h1>
                <div className="flex gap-6 mt-3 text-sm text-[#514133] font-medium">
                  <span><strong>Dates:</strong> {departDateFormatted} {isRoundTrip ? `– ${returnDateFormatted}` : ''}</span>
                  <span><strong>Travelers:</strong> {context.travelers || 1}</span>
                  {context.budget_preference && <span><strong>Budget Style:</strong> {context.budget_preference}</span>}
                </div>
              </div>

              <article className="markdown-body font-body leading-relaxed text-[#111111] prose max-w-none text-[15px]">
                <ReactMarkdown>{cleanItineraryMarkdown(response.itinerary)}</ReactMarkdown>
              </article>

              {/* Budget Summary Section */}
              {response.budget && (
                <div className="mt-6 border-t border-[#E7E1D7] pt-6 flex flex-col gap-4">
                  <h3 className="font-display text-xl font-semibold flex items-center gap-2">
                    <TrendingUp className="w-4.5 h-4.5 text-[#A85D3B]" /> Estimated Budget Summary
                  </h3>
                  <div className="grid grid-cols-5 gap-4 max-md:grid-cols-2">
                    <div className="bg-[#F7F3EA] p-4 rounded-xl border border-[#DED7CA] flex flex-col">
                      <span className="text-[10px] uppercase font-bold text-[#8A847A]">Flights</span>
                      <span className="text-lg font-bold text-[#111111] mt-1">
                        {response.budget.flights ? `₹${response.budget.flights.toLocaleString()}` : 'N/A'}
                      </span>
                    </div>
                    <div className="bg-[#F7F3EA] p-4 rounded-xl border border-[#DED7CA] flex flex-col">
                      <span className="text-[10px] uppercase font-bold text-[#8A847A]">Hotels</span>
                      <span className="text-lg font-bold text-[#111111] mt-1">
                        {response.budget.accommodation ? `₹${response.budget.accommodation.toLocaleString()}` : 'N/A'}
                      </span>
                    </div>
                    <div className="bg-[#F7F3EA] p-4 rounded-xl border border-[#DED7CA] flex flex-col">
                      <span className="text-[10px] uppercase font-bold text-[#8A847A]">Food & Transit</span>
                      <span className="text-lg font-bold text-[#111111] mt-1">
                        {response.budget.food ? `₹${(response.budget.food + (response.budget.local_transport || 0)).toLocaleString()}` : 'N/A'}
                      </span>
                    </div>
                    <div className="bg-[#F7F3EA] p-4 rounded-xl border border-[#DED7CA] flex flex-col">
                      <span className="text-[10px] uppercase font-bold text-[#8A847A]">Activities</span>
                      <span className="text-lg font-bold text-[#111111] mt-1">
                        {response.budget.activities ? `₹${response.budget.activities.toLocaleString()}` : 'N/A'}
                      </span>
                    </div>
                    <div className="bg-[#111111] p-4 rounded-xl flex flex-col max-md:col-span-2">
                      <span className="text-[10px] uppercase font-bold text-[#A85D3B]">Total Est.</span>
                      <span className="text-xl font-bold text-[#F7F3EA] mt-1">
                        {response.budget.total ? `₹${response.budget.total.toLocaleString()}` : 'N/A'}
                      </span>
                    </div>
                  </div>
                  {response.budget.notes && (
                    <p className="text-xs italic text-[#6F6A62] mt-1">{response.budget.notes}</p>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ==================== HOTELS TAB CONTENT ==================== */}
        {activeTab === 'hotels' && (
          <div className="bg-[#FBF8F1] border border-[#DED7CA] rounded-[28px] p-9 max-md:p-6 shadow-[0_8px_32px_rgba(40,32,20,0.03)] flex flex-col gap-6">
            <div className="flex items-center gap-2.5 pb-2 border-b border-[#E7E1D7]">
              <Hotel className="w-5 h-5 text-[#A85D3B]" />
              <h2 className="font-display text-[26px] font-semibold text-[#111111]">
                Recommended accommodation
              </h2>
            </div>

            <div className="flex flex-col gap-6">
              {!response.hotels || response.hotels.length === 0 ? (
                <div className="py-12 text-center flex flex-col items-center gap-3">
                  <AlertTriangle className="w-10 h-10 text-[#B86B47] opacity-80" />
                  <p className="font-semibold text-lg text-[#111111]">No hotels found for this destination.</p>
                  <p className="text-sm text-[#6F6A62]">
                    Please verify your search queries or dates and try again.
                  </p>
                </div>
              ) : (
                response.hotels.map((hotel, idx) => (
                  <div 
                    key={idx}
                    className="flex max-md:flex-col items-start gap-6 p-5 border border-[#DED7CA] rounded-2xl bg-[#F7F3EA]/30 hover:bg-[#F7F3EA]/60 transition-colors"
                  >
                    <div className="flex-grow flex flex-col gap-2">
                      <div className="flex justify-between items-start gap-4">
                        <h3 className="font-display text-xl font-bold text-[#111111]">{hotel.name}</h3>
                        <span className="text-[17px] font-extrabold text-[#111111] whitespace-nowrap">
                          {hotel.price_per_night ? `₹${hotel.price_per_night.toLocaleString()}` : 'N/A'} <span className="text-xs font-semibold text-[#8A847A]">/ night</span>
                        </span>
                      </div>
                      <p className="text-sm font-medium text-[#6F6A62] flex items-center gap-1.5">
                        <MapPin className="w-3.5 h-3.5 text-[#A85D3B]" /> {hotel.location}
                      </p>
                      
                      {hotel.rating && (
                        <div className="flex items-center gap-2 text-xs font-semibold text-[#8A847A] mt-1">
                          <span className="text-[#A85D3B] text-sm">★</span>
                          <span>{hotel.rating} / 5</span>
                          {hotel.review_count && <span>({hotel.review_count} Reviews)</span>}
                        </div>
                      )}

                      {hotel.amenities && hotel.amenities.length > 0 && (
                        <div className="flex flex-wrap gap-2 mt-2 select-none">
                          {hotel.amenities.slice(0, 5).map((am, aIdx) => (
                            <span key={aIdx} className="bg-[#E8DDC7]/40 border border-[#D8D1C5] px-2.5 py-1 rounded-md text-[10px] uppercase font-bold text-[#77745A]">
                              {am}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* ==================== WEATHER TAB CONTENT ==================== */}
        {activeTab === 'weather' && response.weather && (
          <div className="bg-[#FBF8F1] border border-[#DED7CA] rounded-[28px] p-9 max-md:p-6 shadow-[0_8px_32px_rgba(40,32,20,0.03)] flex flex-col gap-6">
            <div className="flex items-center gap-2.5 pb-2 border-b border-[#E7E1D7]">
              <CloudSun className="w-5 h-5 text-[#A85D3B]" />
              <h2 className="font-display text-[26px] font-semibold text-[#111111]">
                Weather Forecast for {response.weather.location}
              </h2>
            </div>

            <div className="flex flex-col gap-6">
              <div className="bg-[#F7F3EA] border border-[#DED7CA] p-6 rounded-2xl flex items-center justify-between max-md:flex-col gap-4 select-none">
                <div className="flex flex-col gap-1">
                  <span className="text-sm font-semibold text-[#8A847A]">Condition Summary</span>
                  <span className="text-xl font-bold text-[#111111]">{response.weather.summary || 'Clear sky'}</span>
                </div>
                <CloudSun className="w-12 h-12 text-[#A85D3B] opacity-80" />
              </div>

              {response.weather.daily && response.weather.daily.length > 0 && (
                <div className="grid grid-cols-4 gap-4 max-md:grid-cols-2 select-none">
                  {response.weather.daily.slice(0, 4).map((day, dIdx) => (
                    <div key={dIdx} className="border border-[#DED7CA] p-4 rounded-xl flex flex-col items-center text-center gap-2">
                      <span className="text-xs font-semibold text-[#8A847A]">
                        {day.date || `Day ${dIdx + 1}`}
                      </span>
                      <span className="text-2xl font-bold text-[#111111]">
                        {day.temp_day !== undefined && day.temp_day !== null 
                          ? `${Math.round(day.temp_day)}°C` 
                          : (day.temp_max !== undefined && day.temp_max !== null 
                              ? `${Math.round(day.temp_max)}°C` 
                              : (day.temp_min !== undefined && day.temp_min !== null 
                                  ? `${Math.round(day.temp_min)}°C` 
                                  : 'N/A'))}
                      </span>
                      <span className="text-xs font-bold uppercase text-[#77745A] bg-[#E8DDC7]/40 px-2 py-0.5 rounded">
                        {day.condition || day.description || 'Clear'}
                      </span>
                      <div className="flex gap-2 text-[10px] font-semibold text-[#8A847A] mt-1">
                        <span>Min: {day.temp_min !== undefined && day.temp_min !== null ? `${Math.round(day.temp_min)}°` : 'N/A'}</span>
                        <span>Max: {day.temp_max !== undefined && day.temp_max !== null ? `${Math.round(day.temp_max)}°` : 'N/A'}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

      </section>


      {/* FLOATING RAG CHATBOT BUTTON */}
      <div className="print:hidden fixed bottom-6 right-6 z-50 flex flex-col items-end gap-3 select-text">
        {/* Chat Window Panel */}
        {isChatOpen && (
          <div className="w-[380px] max-md:w-[calc(100vw-32px)] h-[480px] bg-[#FBF8F1] border border-[#DED7CA] rounded-3xl shadow-[0_12px_40px_rgba(45,35,25,0.12)] flex flex-col overflow-hidden animate-fade-in z-50">
            {/* Chat Header */}
            <div className="bg-[#111111] p-4.5 px-6 flex justify-between items-center text-white border-b border-[#DED7CA]">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4.5 h-4.5 text-[#A85D3B]" />
                <div className="flex flex-col">
                  <span className="text-[14px] font-bold tracking-tight">Wandor Assistant</span>
                  <span className="text-[10px] text-[#A85D3B] font-semibold tracking-wider uppercase">Ask about your journey</span>
                </div>
              </div>
              <button 
                onClick={() => setIsChatOpen(false)}
                className="bg-transparent border-none text-white hover:text-[#A85D3B] font-bold text-xl cursor-pointer p-1 leading-none"
              >
                ×
              </button>
            </div>

            {/* Message History */}
            <div className="flex-grow overflow-y-auto p-5 flex flex-col gap-3.5 bg-[#F7F3EA]/30">
              {chatMessages.map((msg, idx) => {
                const isUser = msg.role === 'user';
                return (
                  <div 
                    key={idx} 
                    className={`max-w-[82%] rounded-2xl p-3.5 text-sm leading-relaxed ${
                      isUser 
                        ? 'bg-[#E8DDC7]/70 border border-[#D8D1C5] text-[#111111] self-end rounded-br-none' 
                        : 'bg-white border border-[#E7E1D7] text-[#111111] self-start rounded-bl-none shadow-sm'
                    }`}
                  >
                    {msg.content === '' && isChatLoading ? (
                      <span className="flex gap-1 items-center py-1">
                        <span className="w-1.5 h-1.5 bg-[#A85D3B] rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                        <span className="w-1.5 h-1.5 bg-[#A85D3B] rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                        <span className="w-1.5 h-1.5 bg-[#A85D3B] rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                      </span>
                    ) : isUser ? (
                      <div className="whitespace-pre-wrap">{msg.content}</div>
                    ) : (
                      <div className="chat-markdown text-sm leading-relaxed text-[#111111] [&>p]:mb-2 [&>p:last-child]:mb-0 [&>ul]:my-1.5 [&>ul]:pl-4 [&>ul]:list-disc [&>ul>li]:mb-1 [&>ol]:my-1.5 [&>ol]:pl-4 [&>ol]:list-decimal [&>ol>li]:mb-1 [&_strong]:text-[#111111] [&_strong]:font-bold">
                        <ReactMarkdown>{cleanItineraryMarkdown(msg.content)}</ReactMarkdown>
                      </div>
                    )}
                  </div>
                );
              })}
              <div ref={chatBottomRef} />
            </div>

            {/* Input Form */}
            <form onSubmit={handleChatSubmit} className="p-3 border-t border-[#DED7CA] bg-[#FBF8F1] flex gap-2 items-center">
              <input 
                type="text"
                placeholder="Ask about your itinerary..."
                value={chatInput}
                onChange={e => setChatInput(e.target.value)}
                disabled={isChatLoading}
                className="flex-grow h-11 px-4 bg-[#F7F3EA] border border-[#D8D1C5] rounded-xl text-sm outline-none placeholder:text-[#8A847A] focus:border-[#111111] transition-all"
              />
              <button 
                type="submit" 
                disabled={!chatInput.trim() || isChatLoading}
                className="w-11 h-11 bg-[#111111] disabled:bg-[#8A847A] hover:bg-[#A85D3B] border-none text-white rounded-xl flex items-center justify-center cursor-pointer transition-colors active:scale-95 flex-shrink-0"
              >
                <Send className="w-4 h-4" />
              </button>
            </form>
          </div>
        )}

        {/* Chat Toggle Button */}
        <button
          onClick={() => setIsChatOpen(!isChatOpen)}
          className="w-[58px] h-[58px] bg-[#FBF8F1] border border-[#D8CBB7] hover:bg-[#F2EDE4] active:scale-95 text-[#111111] rounded-full flex items-center justify-center cursor-pointer shadow-[0_4px_20px_rgba(45,35,25,0.08)] transition-all z-50 group"
          aria-label="Wandor Assistant"
        >
          <div className="relative">
            <MessageSquare className="w-5.5 h-5.5 text-[#111111] group-hover:text-[#A85D3B] transition-colors" />
            <Sparkles className="absolute -top-1.5 -right-1.5 w-3 h-3 text-[#A85D3B]" />
          </div>
        </button>
      </div>

    </div>
  );
};

export default Results;
