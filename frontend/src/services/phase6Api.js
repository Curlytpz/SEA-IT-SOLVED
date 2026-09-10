import api from './api';
export async function uploadQuizSolution(attemptId,questionId,image){const form=new FormData();form.append('image',image);const{data}=await api.post(`/student/attempts/${attemptId}/answers/${questionId}/solution`,form,{headers:{'Content-Type':'multipart/form-data'}});return data.data;}
export async function getQuizSolutions(quizId){const{data}=await api.get(`/instructor/quizzes/${quizId}/solutions`);return data.data;}
export async function recognizeQuizSolution(answerId){const{data}=await api.post(`/instructor/quiz-answers/${answerId}/recognize`);return data.data;}
export async function analyzeQuizSolution(answerId){const{data}=await api.post(`/instructor/quiz-answers/${answerId}/analyze`);return data.data;}
export async function gradeQuizSolution(answerId,grade){const{data}=await api.put(`/instructor/quiz-answers/${answerId}/grade`,grade);return data.data;}
export async function getStudentLearning(){const{data}=await api.get('/student/learning');return data.data;}
export async function getStudentLesson(lessonId){const{data}=await api.get(`/student/lessons/${lessonId}`);return data.data;}
export async function downloadStudentLesson(lessonId,format){const response=await api.get(`/student/lessons/${lessonId}/export/${format}`,{responseType:'blob'});const disposition=response.headers['content-disposition']||'';const encoded=disposition.match(/filename\*=UTF-8''([^;]+)/i);const plain=disposition.match(/filename="?([^";]+)"?/i);const fallback=`Lesson Notes.${format}`;let filename=fallback;try{filename=encoded?decodeURIComponent(encoded[1]):plain?.[1]||fallback;}catch{filename=fallback;}return{blob:response.data,filename};}
export async function startQuizAttempt(quizId){const{data}=await api.post(`/student/quizzes/${quizId}/attempt`);return data.data;}
export async function getQuizAttempt(attemptId){const{data}=await api.get(`/student/attempts/${attemptId}`);return data.data;}
export async function saveQuizAnswer(attemptId,questionId,answer){const{data}=await api.put(`/student/attempts/${attemptId}/answers/${questionId}`,{answer});return data.data;}
export async function submitQuizAttempt(attemptId,confirmUnanswered=false){const{data}=await api.post(`/student/attempts/${attemptId}/submit`,{confirmUnanswered});return data.data;}
export async function getQuizHistory(){const{data}=await api.get('/student/quiz-history');return data.data.attempts;}
export async function getQuizAnalytics(quizId){const{data}=await api.get(`/instructor/quizzes/${quizId}/analytics`);return data.data;}
export async function getSectionAnalytics(sectionId){const{data}=await api.get(`/instructor/sections/${sectionId}/analytics`);return data.data;}
export async function getSystemEvaluation(){const{data}=await api.get('/admin/system-evaluation');return data.data;}


export async function getInstructorQuizAttempts(quizId){const{data}=await api.get(`/instructor/quizzes/${quizId}/attempts`);return data.data;}
export async function getInstructorReviewQueue(){const{data}=await api.get('/instructor/review-queue');return data.data;}


export async function getInstructorSectionReviews(sectionId){const{data}=await api.get(`/instructor/sections/${sectionId}/reviews`);return data.data;}
