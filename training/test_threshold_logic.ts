/**
 * 阈值刷新功能 - 测试用例
 * 验证 recalculateAudioResult 逻辑的正确性
 */

// 模拟 recalculateAudioResult 函数
const recalculateAudioResult = (score: number, threshold: number) => {
    const normalityThreshold = 1 - (threshold / 100);
    const is_abnormal = score < normalityThreshold;

    if (is_abnormal) {
        if (score < 0.3) {
            return { is_abnormal: true, level: 'CRITICAL', status: '严重异常', confidence: 'Very High' };
        } else if (score < 0.4) {
            return { is_abnormal: true, level: 'HIGH', status: '明显异常', confidence: 'High' };
        } else {
            return { is_abnormal: true, level: 'MEDIUM', status: '中度异常', confidence: 'Medium' };
        }
    } else {
        if (score > 0.7) {
            return { is_abnormal: false, level: 'PERFECT', status: '完全正常', confidence: 'Very High' };
        } else if (score > 0.5) {
            return { is_abnormal: false, level: 'NORMAL', status: '基本正常', confidence: 'High' };
        } else {
            return { is_abnormal: false, level: 'SUSPICIOUS', status: '可疑', confidence: 'Medium' };
        }
    }
};

// 测试数据
const testCases = [
    { filename: 'audio1.wav', score: 0.75 },
    { filename: 'audio2.wav', score: 0.45 },
    { filename: 'audio3.wav', score: 0.55 },
    { filename: 'audio4.wav', score: 0.25 },
    { filename: 'audio5.wav', score: 0.35 },
    { filename: 'audio6.wav', score: 0.80 },
    { filename: 'audio7.wav', score: 0.15 },
];

// 测试不同阈值
const thresholds = [30, 50, 70, 90];

console.log('='.repeat(100));
console.log('听觉大师 - 阈值刷新功能测试');
console.log('='.repeat(100));
console.log();

// 打印表头
const header = ['文件名', 'Score', ...thresholds.map(t => `灵敏度 ${t}%`)];
const colWidths = [15, 8, ...thresholds.map(() => 20)];

const printRow = (cells: string[]) => {
    const row = cells.map((cell, i) => cell.padEnd(colWidths[i])).join(' | ');
    console.log(row);
};

printRow(header);
console.log('-'.repeat(100));

// 测试每个音频文件在不同阈值下的判定
testCases.forEach(test => {
    const row = [
        test.filename,
        test.score.toFixed(2),
        ...thresholds.map(threshold => {
            const result = recalculateAudioResult(test.score, threshold);
            const statusEmoji = result.is_abnormal ? '❌' : '✅';
            return `${statusEmoji} ${result.status}`;
        })
    ];
    printRow(row);
});

console.log('='.repeat(100));
console.log();

// 统计不同阈值下的异常数量
console.log('异常检出数统计:');
console.log('-'.repeat(50));
thresholds.forEach(threshold => {
    const abnormalCount = testCases.filter(test => {
        const result = recalculateAudioResult(test.score, threshold);
        return result.is_abnormal;
    }).length;
    const normalCount = testCases.length - abnormalCount;
    const rate = ((normalCount / testCases.length) * 100).toFixed(1);
    console.log(`灵敏度 ${threshold}%: ${abnormalCount} 异常, ${normalCount} 正常, 正常率 ${rate}%`);
});

console.log('='.repeat(100));
console.log();

// 边界测试
console.log('边界测试:');
console.log('-'.repeat(50));

const edgeCases = [
    { desc: 'Score = 0.5, 阈值 = 50%', score: 0.5, threshold: 50 },
    { desc: 'Score = 0.3, 阈值 = 70%', score: 0.3, threshold: 70 },
    { desc: 'Score = 0.7, 阈值 = 30%', score: 0.7, threshold: 30 },
    { desc: 'Score = 1.0, 阈值 = 100%', score: 1.0, threshold: 100 },
    { desc: 'Score = 0.0, 阈值 = 0%', score: 0.0, threshold: 0 },
];

edgeCases.forEach(test => {
    const result = recalculateAudioResult(test.score, test.threshold);
    const statusEmoji = result.is_abnormal ? '❌' : '✅';
    console.log(`${test.desc}`);
    console.log(`  结果: ${statusEmoji} ${result.status} (${result.level}, ${result.confidence})`);
    console.log();
});

console.log('='.repeat(100));
console.log('✅ 测试完成');
console.log('='.repeat(100));

// 导出供 Node.js 使用
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { recalculateAudioResult };
}
