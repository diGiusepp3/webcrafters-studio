import { useState, useMemo } from 'react';
import {
  Folder, FolderOpen, FileCode, FileJson, FileText,
  File, ChevronRight, ChevronDown, Image, Settings, Database
} from 'lucide-react';

const getFileIcon = (filename) => {
  const ext = filename.split('.').pop()?.toLowerCase() || '';
  const iconMap = {
    js: <FileCode className="w-4 h-4 text-yellow-400" />,
    jsx: <FileCode className="w-4 h-4 text-cyan-400" />,
    ts: <FileCode className="w-4 h-4 text-blue-400" />,
    tsx: <FileCode className="w-4 h-4 text-blue-400" />,
    py: <FileCode className="w-4 h-4 text-green-400" />,
    json: <FileJson className="w-4 h-4 text-yellow-500" />,
    html: <FileCode className="w-4 h-4 text-orange-400" />,
    css: <FileCode className="w-4 h-4 text-blue-500" />,
    md: <FileText className="w-4 h-4 text-gray-400" />,
    txt: <FileText className="w-4 h-4 text-gray-400" />,
    png: <Image className="w-4 h-4 text-pink-400" />,
    jpg: <Image className="w-4 h-4 text-pink-400" />,
    jpeg: <Image className="w-4 h-4 text-pink-400" />,
    svg: <Image className="w-4 h-4 text-pink-400" />,
    env: <Settings className="w-4 h-4 text-gray-500" />,
    sql: <Database className="w-4 h-4 text-blue-400" />,
  };
  return iconMap[ext] || <File className="w-4 h-4 text-gray-400" />;
};

// Build tree structure from flat file list
const buildTree = (files) => {
  const root = { name: '', children: {}, files: [] };

  files.forEach((file) => {
    const parts = file.path.split('/');
    let current = root;

    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i];
      if (!current.children[part]) {
        current.children[part] = { name: part, children: {}, files: [] };
      }
      current = current.children[part];
    }

    current.files.push({
      ...file,
      name: parts[parts.length - 1],
    });
  });

  return root;
};

// Tree Node Component
function TreeNode({ node, level = 0, onSelect, selectedPath, expandedFolders, toggleFolder }) {
  const sortedChildren = Object.values(node.children).sort((a, b) =>
    a.name.localeCompare(b.name)
  );
  const sortedFiles = [...node.files].sort((a, b) =>
    a.name.localeCompare(b.name)
  );

  return (
    <>
      {/* Folders */}
      {sortedChildren.map((child) => {
        const folderPath = `${node.name ? node.name + '/' : ''}${child.name}`;
        const isExpanded = expandedFolders.has(folderPath);

        return (
          <div key={child.name}>
            <button
              onClick={() => toggleFolder(folderPath)}
              className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-white/5 transition-colors text-left"
              style={{ paddingLeft: `${level * 12 + 12}px` }}
            >
              <span className="text-gray-500">
                {isExpanded ? (
                  <ChevronDown className="w-3 h-3" />
                ) : (
                  <ChevronRight className="w-3 h-3" />
                )}
              </span>
              {isExpanded ? (
                <FolderOpen className="w-4 h-4 text-cyan-400" />
              ) : (
                <Folder className="w-4 h-4 text-cyan-400" />
              )}
              <span className="text-sm text-gray-300 truncate">{child.name}</span>
            </button>
            {isExpanded && (
              <TreeNode
                node={child}
                level={level + 1}
                onSelect={onSelect}
                selectedPath={selectedPath}
                expandedFolders={expandedFolders}
                toggleFolder={toggleFolder}
              />
            )}
          </div>
        );
      })}

      {/* Files */}
      {sortedFiles.map((file) => (
        <button
          key={file.path}
          onClick={() => onSelect(file)}
          className={`w-full flex items-center gap-2 px-3 py-1.5 transition-colors text-left ${
            selectedPath === file.path
              ? 'bg-cyan-500/20 text-cyan-400 border-l-2 border-cyan-500'
              : 'hover:bg-white/5 text-gray-400 hover:text-white'
          }`}
          style={{ paddingLeft: `${level * 12 + 28}px` }}
        >
          {getFileIcon(file.name)}
          <span className="text-sm truncate">{file.name}</span>
        </button>
      ))}
    </>
  );
}

export function FileTree({ files, onSelect, selectedPath }) {
  const [expandedFolders, setExpandedFolders] = useState(new Set(['', 'src', 'app', 'components']));

  const tree = useMemo(() => buildTree(files || []), [files]);

  const toggleFolder = (path) => {
    setExpandedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  };

  if (!files || files.length === 0) {
    return (
      <div className="p-4 text-center text-gray-500 text-sm">
        No files generated yet
      </div>
    );
  }

  return (
    <div className="py-2">
      <TreeNode
        node={tree}
        onSelect={onSelect}
        selectedPath={selectedPath}
        expandedFolders={expandedFolders}
        toggleFolder={toggleFolder}
      />
    </div>
  );
}
