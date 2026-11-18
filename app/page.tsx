"use client";
import { useEffect, useRef, useState, useCallback } from "react";
import { Camera, Images, QrCode, ArrowLeft, CheckCircle2, RefreshCw, Upload, Share2, X, Download, Heart, ImagePlus, SwitchCamera, AlertCircle, Copy, ExternalLink } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";

type Photo = {id:string;name:string;createdAt:string;by:string};
type Tab="capture"|"gallery"|"share";
const title=process.env.NEXT_PUBLIC_EVENT_NAME||"Our Special Event";
const date=process.env.NEXT_PUBLIC_EVENT_DATE||"A day to remember";
export default function Home(){
  const [key,setKey]=useState("");
  const [tab,setTab]=useState<Tab>("capture");
  const [guest,setGuest]=useState("");
  const [photos,setPhotos]=useState<Photo[]>([]);
  const [selected,setSelected]=useState<Photo|null>(null);
  const [cameraOn,setCameraOn]=useState(false);
  const [facing,setFacing]=useState<"environment"|"user">("environment");
  const [uploading,setUploading]=useState(false);
  const [message,setMessage]=useState("");
  const [error,setError]=useState("");
  const [loading,setLoading]=useState(false);
  const [origin,setOrigin]=useState("");
  const videoRef=useRef<HTMLVideoElement>(null);
  const streamRef=useRef<MediaStream|null>(null);
  const pickerRef=useRef<HTMLInputElement>(null);
  useEffect(()=>{ const params=new URLSearchParams(window.location.search); const k=params.get("key")||""; setKey(k);setOrigin(window.location.origin);try{setGuest(localStorage.getItem("event-guest-name")||"");}catch{} },[]);
  const stopCamera=useCallback(()=>{streamRef.current?.getTracks().forEach(t=>t.stop());streamRef.current=null;setCameraOn(false);},[]);
  const startCamera=useCallback(async()=>{
    setError("");stopCamera();
    if(!navigator.mediaDevices?.getUserMedia){setError("Live camera is unavailable here. Try the Take / Choose Photo button, or open this website in Safari over HTTPS.");return;}
    try{const stream=await navigator.mediaDevices.getUserMedia({audio:false,video:{facingMode:{ideal:facing},width:{ideal:1920},height:{ideal:1080}}});streamRef.current=stream;setCameraOn(true);}
    catch {setError("Camera access was blocked. Allow camera permissions in Safari or use Take / Choose Photo below.");}
  },[facing,stopCamera]);
  useEffect(()=>{if(cameraOn&&videoRef.current&&streamRef.current){videoRef.current.srcObject=streamRef.current;void videoRef.current.play().catch(()=>{});}},[cameraOn]);
  useEffect(()=>()=>stopCamera(),[stopCamera]);
  useEffect(()=>{if(tab!=="capture")stopCamera()},[tab,stopCamera]);
  const load=useCallback(async()=>{if(!key)return;setLoading(true);try{const res=await fetch(`/api/photos?key=${encodeURIComponent(key)}`,{cache:"no-store"});if(!res.ok)throw Error("Gallery unavailable. Check the event link or Drive configuration.");const json=await res.json();setPhotos(json.photos||[]);setError("");}catch(e){setError(e instanceof Error?e.message:"Could not load gallery");}finally{setLoading(false);}},[key]);
  useEffect(()=>{if(tab==="gallery")void load()},[tab,load]);
  async function upload(file:File){
    if(!file.type.startsWith("image/")){setError("Please choose an image.");return;}
    if(file.size>12*1024*1024){setError("This image is over 12 MB. Try another photo.");return;}
    if(uploading)return;
    setUploading(true);setError("");setMessage("");
    try{
      const data=new FormData();data.append("photo",file);data.append("name",guest.trim()||"Guest");
      const res=await fetch("/api/photos",{method:"POST",headers:{"x-event-key":key},body:data});
      const json=await res.json();if(!res.ok)throw Error(json.error||"Upload failed");
      setMessage("Your moment was saved to Google Drive!");try{localStorage.setItem("event-guest-name",guest)}catch{}
    }catch(e){setError((e instanceof Error?e.message:"Upload failed")+" You can try again.");}
    finally{setUploading(false);if(pickerRef.current)pickerRef.current.value="";}
  }
  async function capture(){const video=videoRef.current;if(!video||!video.videoWidth){setError("Camera is not ready yet.");return;}const canvas=document.createElement("canvas");const max=2200;const scale=Math.min(1,max/Math.max(video.videoWidth,video.videoHeight));canvas.width=Math.round(video.videoWidth*scale);canvas.height=Math.round(video.videoHeight*scale);const ctx=canvas.getContext("2d");if(!ctx)return;ctx.drawImage(video,0,0,canvas.width,canvas.height);canvas.toBlob(blob=>{if(blob)void upload(new File([blob],`moment-${Date.now()}.jpg`,{type:"image/jpeg"}));else setError("Could not capture this photo.");},"image/jpeg",0.87);}
  function switchCamera(){setFacing(f=>f==="environment"?"user":"environment");stopCamera();}
  const link=origin&&key?`${origin}/?key=${encodeURIComponent(key)}`:"";
  async function share(){try{if(navigator.share)await navigator.share({title:`${title} – Photo Booth`,text:"Scan, snap, and share your event moments!",url:link});else await copy();}catch{}}
  async function copy(){try{await navigator.clipboard.writeText(link);setMessage("Event link copied!");}catch{setError("Unable to copy. Use your browser's Share option.");}}
  if(!key)return <div className="shell"><header className="brand"><span className="brand-icon">✳</span> gatherly<span className="brand-dot">.</span></header><main className="missing"><QrCode size={44}/><h1>Open your event QR link</h1><p>This page needs your private event link. Ask the host to share the QR code or the link ending in <code>?key=…</code>.</p><p className="muted">Event hosts: see README.md to set up your Google Drive and generate the link.</p></main></div>;
  return <div className="shell">
    <header className="topbar"><div className="brand"><span className="brand-icon">✳</span> gatherly<span className="brand-dot">.</span></div><span className="live-label"><span className="live-dot"/> EVENT PHOTO BOOTH</span></header>
    <main>
      <section className="hero"><div className="hero-kicker">✦ &nbsp; EVERY MOMENT MATTERS</div><h1>{title}</h1><p>{date} <span className="hero-sparkle">✳</span> Made to remember</p></section>
      <nav className="tabs" aria-label="Sections"><button className={tab==="capture"?"active":""} onClick={()=>{setTab("capture");setError("");}}><Camera size={18}/> Capture</button><button className={tab==="gallery"?"active":""} onClick={()=>{setTab("gallery");setError("");}}><Images size={18}/> Gallery</button><button className={tab==="share"?"active":""} onClick={()=>{setTab("share");setError("");}}><QrCode size={18}/> QR / Share</button></nav>
      {message&&<div className="notice success" role="status"><CheckCircle2 size={18}/>{message}<button aria-label="Dismiss" onClick={()=>setMessage("")}><X size={17}/></button></div>}
      {error&&<div className="notice error" role="alert"><AlertCircle size={18}/>{error}<button aria-label="Dismiss" onClick={()=>setError("")}><X size={17}/></button></div>}
      {tab==="capture"&&<section className="section"><div className="section-title"><div><h2>Capture a moment <span>✦</span></h2><p>Smile, snap, and let the memories roll.</p></div></div><label className="field-label" htmlFor="guest">YOUR NAME <span>(OPTIONAL)</span></label><input id="guest" className="name-input" placeholder="e.g. Maria" value={guest} maxLength={50} onChange={e=>setGuest(e.target.value)}/>
      <div className="camera-card"><div className="camera-stage">{cameraOn?<><video ref={videoRef} playsInline muted autoPlay className="camera-video"/><div className="camera-corners"><span/><span/><span/><span/></div></>:<div className="camera-empty"><div className="camera-icon"><Camera size={37} strokeWidth={1.5}/></div><h3>Ready for your close-up?</h3><p>Open your camera to capture<br/>the magic of this moment.</p><div className="stardust">✧ &nbsp; ✦ &nbsp; ✧</div></div>}</div><div className="camera-toolbar">{cameraOn?<><button className="subtle-btn" onClick={switchCamera} disabled={uploading}><SwitchCamera size={19}/> Flip</button><button className="shutter" aria-label="Take photo" onClick={capture} disabled={uploading}><span/></button><button className="subtle-btn" onClick={stopCamera}><X size={19}/> Close</button></>:<button className="primary-btn" onClick={()=>void startCamera()} disabled={uploading}><Camera size={20}/> Open camera</button>}</div></div>
      <input ref={pickerRef} className="hidden" type="file" accept="image/*" capture="environment" onChange={e=>{const file=e.target.files?.[0];if(file)void upload(file);}}/><button className="secondary-btn full" disabled={uploading} onClick={()=>pickerRef.current?.click()}><ImagePlus size={19}/> Take / Choose Photo</button><p className="helper">Photos upload automatically to the event&apos;s Google Drive folder after capture. No account needed for guests.</p>{uploading&&<div className="upload-status"><span className="spinner"/> Uploading securely to Google Drive…</div>}
      <button className="gallery-jump" onClick={()=>setTab("gallery")}>View everyone&apos;s moments <span>↗</span></button></section>}
      {tab==="gallery"&&<section className="section"><div className="section-title spaced"><div><h2>Our memory wall <span>♡</span></h2><p>All the beautiful moments, together.</p></div><button className="icon-btn" title="Refresh gallery" aria-label="Refresh gallery" onClick={()=>void load()}><RefreshCw size={19}/></button></div>{loading?<div className="empty-gallery"><span className="spinner"/> Loading moments…</div>:photos.length===0?<div className="empty-gallery"><Heart size={36}/><h3>The story starts with you.</h3><p>Be the first to share a photo!</p><button className="primary-btn" onClick={()=>setTab("capture")}>Take the first photo</button></div>:<><p className="photo-count">{photos.length} shared {photos.length===1?"moment":"moments"}</p><div className="gallery-grid">{photos.map(p=><button key={p.id} className="photo-tile" onClick={()=>setSelected(p)}><img loading="lazy" alt={`Moment shared by ${p.by}`} src={`/api/photos/${p.id}?key=${encodeURIComponent(key)}`}/><span>{p.by}</span></button>)}</div></>}</section>}
      {tab==="share"&&<section className="section"><div className="section-title"><div><h2>Spread the joy <span>✳</span></h2><p>One scan, a thousand memories.</p></div></div><div className="qr-card"><div className="qr-frame">{link&&<QRCodeSVG value={link} size={210} bgColor="#ffffff" fgColor="#283c33" level="H" marginSize={2}/>}</div><h3>Scan. Snap. Share.</h3><p>Invite everyone to add their favorite event moments.</p></div><div className="share-actions"><button className="primary-btn" onClick={()=>void share()}><Share2 size={19}/> Share event link</button><button className="secondary-btn" onClick={()=>void copy()}><Copy size={18}/> Copy link</button></div><div className="tip"><strong>Host tip</strong><p>Display this QR code at the entrance and on tables. Guests can scan it with their iPhone camera.</p></div></section>}
      {selected&&<div className="lightbox" role="dialog" aria-modal="true" aria-label="Photo viewer" onClick={()=>setSelected(null)}><button className="close-lightbox" onClick={()=>setSelected(null)} aria-label="Close"><X/></button><img src={`/api/photos/${selected.id}?key=${encodeURIComponent(key)}`} alt={`Shared by ${selected.by}`} onClick={e=>e.stopPropagation()}/><div className="lightbox-foot">Shared by {selected.by}<a href={`/api/photos/${selected.id}?key=${encodeURIComponent(key)}`} target="_blank" rel="noreferrer" onClick={e=>e.stopPropagation()}><ExternalLink size={16}/> Open photo</a></div></div>}
    </main><footer>Made for moments worth keeping <span>✳</span></footer>
  </div>;
}
