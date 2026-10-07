// Shared by the browser and dependency-free regression tests.
(function (root) {
    'use strict';
    const SUPPORT_URL = 'https://ko-fi.com/focustube';
    const safeId = value => typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value) && !['__proto__', 'prototype', 'constructor'].includes(value);
    const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
    const text = (value, fallback = '') => typeof value === 'string' ? value.slice(0, 100000) : fallback;
    const seconds = value => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0;
    function rejectUnsafeKeys(value) {
        if (!value || typeof value !== 'object') return;
        for (const key of Object.keys(value)) {
            if (['__proto__', 'prototype', 'constructor'].includes(key)) throw new Error('Invalid backup key.');
            rejectUnsafeKeys(value[key]);
        }
    }
    function normalizeData(input) {
        if (!record(input) || !record(input.courses)) throw new Error('Invalid backup file format.');
        rejectUnsafeKeys(input);
        const courses = {};
        for (const [id, course] of Object.entries(input.courses)) {
            if (!safeId(id) || !record(course)) throw new Error('Invalid course in backup.');
            if (course.videos !== undefined && !Array.isArray(course.videos)) throw new Error('Invalid video list.');
            const videos = (course.videos || []).map(video => {
                if (!record(video) || !safeId(video.id)) throw new Error('Invalid video in backup.');
                return { id: video.id, title: text(video.title, 'Untitled Video') };
            });
            const videosProgress = {};
            const notes = {};
            if (course.videosProgress !== undefined && !record(course.videosProgress)) throw new Error('Invalid progress data.');
            if (course.notes !== undefined && !record(course.notes)) throw new Error('Invalid notes data.');
            for (const [videoId, progress] of Object.entries(course.videosProgress || {})) {
                if (!safeId(videoId) || !record(progress)) throw new Error('Invalid progress entry.');
                videosProgress[videoId] = { watchTime: seconds(progress.watchTime), completed: progress.completed === true };
            }
            for (const [videoId, entries] of Object.entries(course.notes || {})) {
                if (!safeId(videoId) || !Array.isArray(entries)) throw new Error('Invalid notes entry.');
                notes[videoId] = entries.map(note => {
                    if (!record(note) || typeof note.text !== 'string') throw new Error('Invalid note.');
                    return { time: seconds(note.time), text: text(note.text) };
                });
            }
            const lastVideoIndex = Number.isInteger(course.lastVideoIndex) && course.lastVideoIndex >= 0
                && course.lastVideoIndex < videos.length ? course.lastVideoIndex : 0;
            courses[id] = { id, title: text(course.title, 'Untitled Course'), videos, videosProgress, notes,
                lastVideoIndex, isCompleted: course.isCompleted === true };
        }
        return { userName: text(input.userName), courses, totalStudyTime: seconds(input.totalStudyTime),
            lastAccessedCourseTitle: text(input.lastAccessedCourseTitle), supportLink: SUPPORT_URL,
            maxCourses: Number.isInteger(input.maxCourses) && input.maxCourses > 0 && input.maxCourses <= 100 ? input.maxCourses : 5,
            authLevel: 'local' };
    }
    const api = { normalizeData, safeId, SUPPORT_URL, MAX_BACKUP_BYTES: 10 * 1024 * 1024 };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else root.FocusTubeSecurity = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
