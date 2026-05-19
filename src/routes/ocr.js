const express=require('express'); const multer=require('multer'); const path=require('path'); const {runOcr}=require('../services/ocrService'); const {requireAuth}=require('../middleware/auth'); const router=express.Router(); const upload=multer({dest:path.join(process.cwd(),process.env.UPLOAD_DIR||'uploads'),limits:{fileSize:12*1024*1024}});
router.get('/api/version',(req,res)=>res.json({version:'19.0.0',ocr:'google-vision'}));
router.get('/api/ocr-status',(req,res)=>res.json({provider:process.env.OCR_PROVIDER||'google',googleVision:!!process.env.GOOGLE_VISION_API_KEY}));
router.post('/api/ocr',requireAuth,upload.single('receipt'),async(req,res)=>{ try{ if(!req.file) return res.status(400).json({ok:false,error:'Dosya yok'}); const result=await runOcr(req.file); res.json({ok:true,...result}); }catch(e){ res.status(500).json({ok:false,error:e.message}); } });
module.exports=router;
