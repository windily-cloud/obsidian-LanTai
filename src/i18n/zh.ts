import { en } from './en.ts';

type MenuStrings = Record<keyof typeof en.menu, string>;

interface ZhDictionary {
	readonly menu: MenuStrings;
}

export const zh = {
	menu: {
		copyAbsolutePath: '复制绝对路径',
		copyImage: '复制图片',
		copyObsidianUrl: '复制 Obsidian URL',
		copyPath: '复制路径',
		copyVaultPath: '复制库路径',
		deleteImage: '删除图片',
		downloadImage: '下载图片',
		layout: '布局',
		layoutCenter: '居中',
		layoutLeft: '居左',
		layoutRight: '居右',
		localizeImage: '本地化图片',
		moveFileTo: '移动到...',
		openInNewTab: '在新标签页中打开',
		openInNewTabGroup: '在新标签组中打开',
		openInNewWindow: '在新窗口中打开',
		openWithDefaultApp: '使用默认应用打开',
		removeImage: '移除图片',
		rename: '重命名',
		replaceContent: '替换图片',
		resetSize: '重置大小',
		showInFileList: '在文件列表中显示',
		showInFolder: '在访达中显示',
		star: '添加到书签',
		uploadImage: '上传图片'
	}
} satisfies ZhDictionary;
