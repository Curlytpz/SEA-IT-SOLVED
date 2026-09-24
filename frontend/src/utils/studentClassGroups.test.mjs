import assert from 'node:assert/strict';
import {
  buildStudentClassGroups,
  classQuizStatus,
  lessonQuizStatus,
} from './studentClassGroups.js';

const enrollments = [
  { enrollmentId:'e-1', enrollmentStatus:'APPROVED', section:{ id:'section-201', subjectCode:'CALC2', subjectName:'Calculus 2', sectionName:'CPE-201', instructorName:'Maria Santos', instructorStatus:'ACTIVE' } },
  { enrollmentId:'e-2', enrollmentStatus:'APPROVED', section:{ id:'section-401', subjectCode:'CALC2', subjectName:'Calculus 2', sectionName:'CPE-401', instructorName:'Maria Santos', instructorStatus:'ACTIVE' } },
  { enrollmentId:'e-3', enrollmentStatus:'PENDING', section:{ id:'section-pending', subjectCode:'PHY1', subjectName:'Physics 1', sectionName:'CPE-101', instructorName:'Ana Cruz', instructorStatus:'ACTIVE' } },
];

const lessons = [
  { id:'lesson-new', title:'Integration to Limits', section:{ id:'section-401', subjectCode:'CALC2', subjectName:'Calculus 2', name:'CPE-401', instructorName:'Maria Santos' }, pendingQuizzes:2, completedQuizzes:0, awaitingReviewQuizzes:0, totalQuizzes:2 },
  { id:'lesson-old', title:'Limits', section:{ id:'section-401', subjectCode:'CALC2', subjectName:'Calculus 2', name:'CPE-401', instructorName:'Maria Santos' }, pendingQuizzes:1, completedQuizzes:1, awaitingReviewQuizzes:0, totalQuizzes:2 },
];

const groups = buildStudentClassGroups(enrollments, lessons);
assert.equal(groups.length, 2, 'only approved classes are available on the dashboard');
assert.deepEqual(groups.map(group => group.id), ['section-201', 'section-401'], 'classes remain grouped by stable section ID');
assert.equal(groups[0].summary.lessonCount, 0, 'an approved class remains visible without published lessons');
assert.deepEqual(groups[1].lessons.map(lesson => lesson.id), ['lesson-new', 'lesson-old'], 'lesson API ordering is preserved');
assert.equal(groups[1].latestLesson.id, 'lesson-new');
assert.equal(groups[1].summary.pendingQuizzes, 3);
assert.equal(classQuizStatus(groups[1].summary), '3 quizzes to answer');
assert.equal(lessonQuizStatus(lessons[0]), '2 quizzes to answer');

console.log('Student class grouping tests passed.');
