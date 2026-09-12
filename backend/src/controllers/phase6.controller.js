const asyncHandler=require('../utils/asyncHandler');
const service=require('../services/phase6.service');
const tutor=require('../services/quiz-tutor.service');
const {createLessonExport}=require('../services/lesson-export.service');
const dashboard=asyncHandler(async(req,res)=>res.json({success:true,data:await service.dashboard(req.user.id)}));
const lesson=asyncHandler(async(req,res)=>{res.set('Cache-Control','private, no-store');res.json({success:true,data:await service.lessonDetail(req.params.lessonId,req.user.id)});});
const lessonExport=asyncHandler(async(req,res)=>{
  const published=await service.publishedLessonData(req.params.lessonId,req.user.id);
  const file=await createLessonExport(published,req.params.format);
  const fallback=file.filename.replace(/[^ -~]/g,'').replace(/["\\]/g,'_');
  res.set({
    'Content-Type':file.contentType,
    'Content-Length':file.buffer.length,
    'Content-Disposition':`attachment; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(file.filename)}`,
    'Cache-Control':'private, no-store',
    'X-Content-Type-Options':'nosniff',
  });
  res.send(file.buffer);
});
const start=asyncHandler(async(req,res)=>res.status(201).json({success:true,data:await service.startAttempt(req.params.quizId,req.user.id)}));
const attempt=asyncHandler(async(req,res)=>res.json({success:true,data:await service.attemptPayload(req.params.attemptId,req.user.id)}));
const answer=asyncHandler(async(req,res)=>res.json({success:true,data:await service.saveAnswer(req.params.attemptId,req.params.questionId,req.user.id,req.body?.answer)}));
const submit=asyncHandler(async(req,res)=>res.json({success:true,data:await service.submitAttempt(req.params.attemptId,req.user.id,{confirmUnanswered:req.body?.confirmUnanswered===true})}));
const history=asyncHandler(async(req,res)=>res.json({success:true,data:{attempts:await service.quizHistory(req.user.id)}}));
const quizAnalytics=asyncHandler(async(req,res)=>res.json({success:true,data:await service.quizAnalytics(req.params.quizId,req.user.id)}));
const sectionAnalytics=asyncHandler(async(req,res)=>res.json({success:true,data:await service.sectionAnalytics(req.params.sectionId,req.user.id)}));
const systemEvaluation=asyncHandler(async(req,res)=>res.json({success:true,data:await service.systemEvaluation()}));
const privateTutorResponse=res=>res.set('Cache-Control','private, no-store');
const getTutor=asyncHandler(async(req,res)=>privateTutorResponse(res).json({success:true,data:await tutor.getTutor(req.params.attemptId,req.user.id)}));
const generateTutor=asyncHandler(async(req,res)=>privateTutorResponse(res).json({success:true,data:await tutor.generateTutor(req.params.attemptId,req.user.id)}));
const generateTutorPractice=asyncHandler(async(req,res)=>privateTutorResponse(res).status(201).json({success:true,data:await tutor.generatePractice(req.params.attemptId,req.user.id)}));
const checkTutorPractice=asyncHandler(async(req,res)=>privateTutorResponse(res).json({success:true,data:await tutor.checkPractice(req.params.attemptId,req.params.practiceId,req.user.id,req.body?.answer)}));
module.exports={dashboard,lesson,lessonExport,start,attempt,answer,submit,history,quizAnalytics,sectionAnalytics,systemEvaluation,getTutor,generateTutor,generateTutorPractice,checkTutorPractice};
