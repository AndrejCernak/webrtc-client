import { useEffect, useRef, useState } from 'react';

export default function Home() {
  const localVideo = useRef<HTMLVideoElement>(null);
  const remoteVideo = useRef<HTMLVideoElement>(null);
  const peerRef = useRef<RTCPeerConnection>();
  const socketRef = useRef<WebSocket>();
  const [yourId, setYourId] = useState('');
  const [remoteId, setRemoteId] = useState('');
  const [incomingCall, setIncomingCall] = useState<string | null>(null);

  useEffect(() => {
    const id = crypto.randomUUID().slice(0, 6);
    setYourId(id);

    socketRef.current = new WebSocket('wss://tokenytest.onrender.com'); // zmeň ak máš inú doménu

    socketRef.current.onopen = () => {
      socketRef.current?.send(JSON.stringify({ type: 'register', id }));
    };

    socketRef.current.onmessage = async (message) => {
      const data = JSON.parse(message.data);

      if (data.type === 'incoming-call') {
        setIncomingCall(data.from);
      }

      if (data.type === 'signal') {
        if (!peerRef.current) await createPeer(false, data.from);

        if (data.signal?.type === 'offer') {
          await peerRef.current?.setRemoteDescription(new RTCSessionDescription(data.signal));
          const answer = await peerRef.current?.createAnswer();
          await peerRef.current?.setLocalDescription(answer);
          socketRef.current?.send(JSON.stringify({
            type: 'signal',
            to: data.from,
            from: yourId,
            signal: answer,
          }));
        } else if (data.signal?.type === 'answer') {
          await peerRef.current?.setRemoteDescription(new RTCSessionDescription(data.signal));
        }
      }
    };
  }, []);

  async function createPeer(initiator: boolean, targetId: string) {
    const peer = new RTCPeerConnection({
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
    });

    peer.ontrack = (e) => {
      if (remoteVideo.current) remoteVideo.current.srcObject = e.streams[0];
    };

    const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    if (localVideo.current) localVideo.current.srcObject = stream;

    stream.getTracks().forEach(track => peer.addTrack(track, stream));
    peerRef.current = peer;

    peer.onicecandidate = (e) => {
      if (!e.candidate) {
        socketRef.current?.send(JSON.stringify({
          type: 'signal',
          to: targetId,
          from: yourId,
          signal: peer.localDescription,
        }));
      }
    };

    if (initiator) {
      const offer = await peer.createOffer();
      await peer.setLocalDescription(offer);
    }
  }

  function call() {
    createPeer(true, remoteId);
    socketRef.current?.send(JSON.stringify({
      type: 'call',
      from: yourId,
      to: remoteId,
    }));
  }

  function accept() {
    createPeer(false, incomingCall!);
    setIncomingCall(null);
  }

  return (
    <main style={{ padding: 20 }}>
      <h1>Tvoje ID: {yourId}</h1>

      <div>
        <input
          type="text"
          placeholder="Zadaj ID používateľa"
          value={remoteId}
          onChange={(e) => setRemoteId(e.target.value)}
        />
        <button onClick={call}>📞 Zavolať</button>
      </div>

      {incomingCall && (
        <div>
          <p>Volá ti: {incomingCall}</p>
          <button onClick={accept}>✅ Prijať</button>
        </div>
      )}

      <div style={{ display: 'flex', gap: 20, marginTop: 20 }}>
        <div>
          <h3>Lokálne video</h3>
          <video ref={localVideo} autoPlay playsInline muted width={300} />
        </div>
        <div>
          <h3>Vzdialené video</h3>
          <video ref={remoteVideo} autoPlay playsInline width={300} />
        </div>
      </div>
    </main>
  );
}
