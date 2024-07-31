import React, { useState, useRef, useEffect } from 'react';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { createPiper } from '@piperjs/piper-web';
import { useAsync } from 'react-use';
import lamejs from 'lamejs';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Mic, StopCircle, Volume2 } from 'lucide-react';

const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY;
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

const Index = () => {
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [responseText, setResponseText] = useState('');
  const [progress, setProgress] = useState(0);

  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const piperRef = useRef(null);

  const { value: piper } = useAsync(async () => {
    const piper = await createPiper();
    await piper.loadModel('en_US-amy-low.onnx');
    piperRef.current = piper;
    return piper;
  }, []);

  useEffect(() => {
    return () => {
      if (piperRef.current) {
        piperRef.current.terminate();
      }
    };
  }, []);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorderRef.current = new MediaRecorder(stream);
      audioChunksRef.current = [];

      mediaRecorderRef.current.ondataavailable = (event) => {
        audioChunksRef.current.push(event.data);
      };

      mediaRecorderRef.current.onstop = processAudioData;

      mediaRecorderRef.current.start();
      setIsRecording(true);
      setProgress(0);
    } catch (error) {
      console.error('Error accessing microphone:', error);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const processAudioData = async () => {
    setIsProcessing(true);
    setProgress(25);

    const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/wav' });
    const mp3Data = await convertToMp3(audioBlob);
    
    setProgress(50);

    try {
      const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro" });
      const prompt = "Transcribe the audio and respond to it concisely.";
      const result = await model.generateContent([prompt, mp3Data]);
      const response = await result.response;
      const text = response.text();
      setResponseText(text);
      setProgress(75);
      speakResponse(text);
    } catch (error) {
      console.error('Error processing audio with Gemini:', error);
      setResponseText('Error processing audio. Please try again.');
      setIsProcessing(false);
      setProgress(0);
    }
  };

  const convertToMp3 = (blob) => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (event) => {
        const buffer = event.target.result;
        const wav = lamejs.WavHeader.readHeader(new DataView(buffer));
        const samples = new Int16Array(buffer, wav.dataOffset, wav.dataLen / 2);
        const mp3encoder = new lamejs.Mp3Encoder(1, wav.sampleRate, 128);
        const mp3Data = [];

        const sampleBlockSize = 1152;
        for (let i = 0; i < samples.length; i += sampleBlockSize) {
          const sampleChunk = samples.subarray(i, i + sampleBlockSize);
          const mp3buf = mp3encoder.encodeBuffer(sampleChunk);
          if (mp3buf.length > 0) {
            mp3Data.push(new Int8Array(mp3buf));
          }
        }

        const mp3buf = mp3encoder.flush();
        if (mp3buf.length > 0) {
          mp3Data.push(new Int8Array(mp3buf));
        }

        const mp3Blob = new Blob(mp3Data, { type: 'audio/mp3' });
        resolve(mp3Blob);
      };
      reader.readAsArrayBuffer(blob);
    });
  };

  const speakResponse = async (text) => {
    if (piperRef.current) {
      setIsSpeaking(true);
      const audioContext = new (window.AudioContext || window.webkitAudioContext)();
      const audioBuffer = await piperRef.current.synthesize(text);
      const source = audioContext.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(audioContext.destination);
      source.onended = () => {
        setIsSpeaking(false);
        setIsProcessing(false);
        setProgress(100);
        setTimeout(() => setProgress(0), 1000);
      };
      source.start();
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-100 p-4">
      <h1 className="text-3xl font-bold mb-8">Audio Chat with Gemini 1.5 Pro</h1>
      <div className="w-full max-w-md bg-white rounded-lg shadow-md p-6">
        <div className="flex justify-center mb-4">
          {!isRecording ? (
            <Button onClick={startRecording} disabled={isProcessing || isSpeaking}>
              <Mic className="mr-2 h-4 w-4" /> Start Recording
            </Button>
          ) : (
            <Button onClick={stopRecording} variant="destructive">
              <StopCircle className="mr-2 h-4 w-4" /> Stop Recording
            </Button>
          )}
        </div>
        <Progress value={progress} className="mb-4" />
        <div className="text-center mb-4">
          {isProcessing ? 'Processing...' : isSpeaking ? 'Speaking...' : 'Ready'}
        </div>
        {responseText && (
          <div className="bg-gray-100 p-4 rounded-md mb-4">
            <h2 className="font-semibold mb-2">Response:</h2>
            <p>{responseText}</p>
          </div>
        )}
        {responseText && !isSpeaking && (
          <Button onClick={() => speakResponse(responseText)} className="w-full">
            <Volume2 className="mr-2 h-4 w-4" /> Speak Response Again
          </Button>
        )}
      </div>
    </div>
  );
};

export default Index;
