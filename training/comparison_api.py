#!/usr/bin/env python3
"""
模型对比API封装
提供简单的API接口来运行模型对比功能
"""

import os
import sys
import json
import subprocess
from pathlib import Path
from datetime import datetime
from typing import Dict, List, Optional

# 添加当前目录到路径
sys.path.insert(0, str(Path(__file__).parent))


class ModelComparisonAPI:
    """模型对比API类"""

    def __init__(self, base_dir: str = None):
        """初始化API"""
        self.base_dir = Path(base_dir) if base_dir else Path(__file__).parent
        self.comparison_script = self.base_dir / 'comprehensive_model_comparison.py'

    def start_comparison(
        self,
        preset: str = 'basic',
        models: Optional[List[str]] = None,
        epochs: Optional[List[int]] = None,
        data_dir: str = 'dataset_raw',
        augment: bool = True,
        imgsz: Optional[List[int]] = None
    ) -> Dict:
        """
        启动模型对比任务

        Args:
            preset: 预设模式 (basic/standard/full)
            models: 模型列表 (如 ['nano', 'small', 'medium'])
            epochs: 训练轮数列表 (如 [50, 100])
            data_dir: 数据集目录
            augment: 是否启用数据增强
            imgsz: 图片尺寸列表 (如 [640, 800])

        Returns:
            包含任务ID和状态的字典
        """
        # 构建命令
        cmd = [
            'python3',
            str(self.comparison_script),
            '--data_dir', data_dir
        ]

        # 使用预设或自定义参数
        if preset and not models:
            cmd.extend(['--preset', preset])
        else:
            # 自定义参数
            if models:
                cmd.extend(['--models'] + models)
            if epochs:
                cmd.extend(['--epochs'] + [str(e) for e in epochs])
            if imgsz:
                cmd.extend(['--imgsz'] + [str(s) for s in imgsz])

        # 数据增强
        if augment:
            cmd.append('--augment')

        # 在后台启动进程
        try:
            process = subprocess.Popen(
                cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                cwd=str(self.base_dir),
                text=True
            )

            # 生成任务ID
            task_id = f"comparison_{datetime.now().strftime('%Y%m%d_%H%M%S')}"

            # 保存任务信息
            task_info = {
                'task_id': task_id,
                'pid': process.pid,
                'preset': preset,
                'models': models,
                'epochs': epochs,
                'data_dir': data_dir,
                'augment': augment,
                'imgsz': imgsz,
                'start_time': datetime.now().isoformat(),
                'status': 'running',
                'command': ' '.join(cmd)
            }

            # 保存到文件
            task_file = self.base_dir / f'{task_id}.json'
            with open(task_file, 'w', encoding='utf-8') as f:
                json.dump(task_info, f, ensure_ascii=False, indent=2)

            return {
                'success': True,
                'task_id': task_id,
                'pid': process.pid,
                'status': 'started',
                'message': f'模型对比任务已启动 (PID: {process.pid})'
            }

        except Exception as e:
            return {
                'success': False,
                'error': str(e),
                'message': f'启动失败: {str(e)}'
            }

    def get_comparison_status(self, task_id: str) -> Dict:
        """
        获取对比任务状态

        Args:
            task_id: 任务ID

        Returns:
            任务状态信息
        """
        task_file = self.base_dir / f'{task_id}.json'

        if not task_file.exists():
            return {
                'success': False,
                'error': 'Task not found',
                'message': f'任务不存在: {task_id}'
            }

        # 读取任务信息
        with open(task_file, 'r', encoding='utf-8') as f:
            task_info = json.load(f)

        # 检查进程是否还在运行
        pid = task_info.get('pid')
        is_running = self._is_process_running(pid)

        # 查找报告目录
        report_dir = self._find_latest_comparison_report()

        status = {
            'success': True,
            'task_id': task_id,
            'status': 'running' if is_running else 'completed',
            'start_time': task_info.get('start_time'),
            'config': {
                'preset': task_info.get('preset'),
                'models': task_info.get('models'),
                'epochs': task_info.get('epochs'),
                'data_dir': task_info.get('data_dir'),
                'augment': task_info.get('augment')
            }
        }

        # 如果任务完成，添加报告信息
        if not is_running and report_dir:
            status['report_dir'] = str(report_dir)
            status['report_url'] = f'/training/{report_dir.name}/comparison_report.html'

            # 读取结果摘要
            results_json = report_dir / 'results.json'
            if results_json.exists():
                with open(results_json, 'r', encoding='utf-8') as f:
                    results = json.load(f)
                    if 'best_model' in results:
                        status['best_model'] = results['best_model']

        return status

    def list_comparison_reports(self) -> List[Dict]:
        """
        列出所有对比报告

        Returns:
            报告列表
        """
        reports = []

        # 查找所有comparison_report_*目录
        for report_dir in self.base_dir.glob('comparison_report_*'):
            if report_dir.is_dir():
                # 读取results.json
                results_json = report_dir / 'results.json'
                report_html = report_dir / 'comparison_report.html'

                if report_html.exists():
                    report_info = {
                        'name': report_dir.name,
                        'created_at': datetime.fromtimestamp(
                            report_dir.stat().st_mtime
                        ).isoformat(),
                        'report_url': f'/training/{report_dir.name}/comparison_report.html'
                    }

                    # 添加摘要信息
                    if results_json.exists():
                        try:
                            with open(results_json, 'r', encoding='utf-8') as f:
                                results = json.load(f)
                                report_info['total_experiments'] = results.get('total_experiments', 0)
                                if 'best_model' in results:
                                    report_info['best_model'] = results['best_model']
                        except:
                            pass

                    reports.append(report_info)

        # 按创建时间排序
        reports.sort(key=lambda x: x['created_at'], reverse=True)

        return reports

    def _is_process_running(self, pid: int) -> bool:
        """检查进程是否在运行"""
        if not pid:
            return False

        try:
            os.kill(pid, 0)
            return True
        except (OSError, ProcessLookupError):
            return False

    def _find_latest_comparison_report(self) -> Optional[Path]:
        """查找最新的对比报告目录"""
        report_dirs = list(self.base_dir.glob('comparison_report_*'))
        if not report_dirs:
            return None

        # 按修改时间排序，返回最新的
        report_dirs.sort(key=lambda x: x.stat().st_mtime, reverse=True)
        return report_dirs[0]


# 便捷函数
def start_comparison(**kwargs) -> Dict:
    """启动模型对比 (便捷函数)"""
    api = ModelComparisonAPI()
    return api.start_comparison(**kwargs)


def get_status(task_id: str) -> Dict:
    """获取任务状态 (便捷函数)"""
    api = ModelComparisonAPI()
    return api.get_comparison_status(task_id)


def list_reports() -> List[Dict]:
    """列出所有报告 (便捷函数)"""
    api = ModelComparisonAPI()
    return api.list_comparison_reports()


if __name__ == '__main__':
    # 测试API
    print("模型对比API测试")
    print("=" * 60)

    # 测试启动对比
    print("\n1. 启动基础对比测试...")
    result = start_comparison(
        preset='basic',
        data_dir='dataset_raw',
        augment=True
    )
    print(f"结果: {json.dumps(result, ensure_ascii=False, indent=2)}")

    # 测试列出报告
    print("\n2. 列出现有报告...")
    reports = list_reports()
    print(f"找到 {len(reports)} 个报告")
    for report in reports[:3]:
        print(f"  - {report['name']}: {report.get('total_experiments', '?')} 个实验")
