const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeData, safeId, SUPPORT_URL } = require('../security.js');
const valid = () => ({ userName: 'Learner', courses: { PL_test: { title: '<b>Text</b>', videos: [{id: 'abcdefghijk', title: 'Lesson'}], notes: {abcdefghijk: [{time: 42, text: 'A note'}]}, videosProgress: {abcdefghijk: {watchTime: 43, completed: true}}, lastVideoIndex: 0 } }, totalStudyTime: 43, maxCourses: 5 });
test('valid backups retain courses, titles, progress and notes', () => {
    const data = normalizeData(valid());
    assert.equal(data.courses.PL_test.title, '<b>Text</b>');
    assert.equal(data.courses.PL_test.notes.abcdefghijk[0].time, 42);
    assert.equal(data.courses.PL_test.videosProgress.abcdefghijk.completed, true);
    assert.equal(data.totalStudyTime, 43);
});
test('backup cannot supply authentication or executable links', () => {
    const data = normalizeData({...valid(), authLevel: 'cloud', supportLink: 'javascript:alert(1)', unknown: 'ignored'});
    assert.equal(data.authLevel, 'local'); assert.equal(data.supportLink, SUPPORT_URL); assert.equal(data.unknown, undefined);
});
test('rejects polluted keys at any nesting depth', () => {
    for (const key of ['__proto__', 'constructor', 'prototype']) {
        assert.throws(() => normalizeData(JSON.parse(`{"courses":{},"extra":{"${key}":{}}}`)));
    }
    assert.equal({}.polluted, undefined);
});
test('rejects malformed root, courses, videos, progress and notes', () => {
    for (const data of [null, [], {courses:[]}, {courses:{PL_test:null}}, {courses:{PL_test:{videos:{}}}}, {courses:{PL_test:{notes:{abcdefghijk:'bad'}}}}, {courses:{PL_test:{videosProgress:[]}}}]) assert.throws(() => normalizeData(data));
});
test('rejects injection in video IDs and course IDs', () => {
    assert.equal(safeId('abcdefghijk'), true);
    for (const id of ['__proto__', 'a\' onclick=\'x', 'x);alert(1)', 'https://evil.invalid', '']) {
        const data = valid(); data.courses.PL_test.videos[0].id = id;
        assert.throws(() => normalizeData(data));
    }
    assert.throws(() => normalizeData({courses: {'x" onmouseover="alert(1)':{}}}));
});
test('normalizes unsafe time, indices and booleans without code execution', () => {
    const data = valid();
    data.courses.PL_test.notes.abcdefghijk[0].time = '0);alert(1)//';
    data.courses.PL_test.lastVideoIndex = 999;
    data.courses.PL_test.videosProgress.abcdefghijk = {completed:'true', watchTime:-1};
    const output = normalizeData(data).courses.PL_test;
    assert.equal(output.notes.abcdefghijk[0].time, 0); assert.equal(output.lastVideoIndex, 0);
    assert.deepEqual(output.videosProgress.abcdefghijk, {completed:false, watchTime:0});
});
