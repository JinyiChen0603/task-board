const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const fs = require('fs');
const path = require('path');
const os = require('os');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

const PORT = 5001;
const DATA_FILE = path.join(__dirname, 'data.json');

// 用户配置（所有任务都是共享区域，不硬分配）
const USERS = {
  '左宇翔': { color: '#FF6B6B', range: [323, 622] },
  '周玉': { color: '#9B59B6', range: [323, 622], isAdmin: true },  // 管理员，可以标记所有格子
  '彭逸': { color: '#2980B9', range: [323, 622] },
  '葛新麟': { color: '#FFA07A', range: [323, 622] },
  '陈锦熠': { color: '#4ECDC4', range: [323, 622], canAssign: true },  // 可以分配任务
  '黑典': { color: '#2ECC71', range: [323, 622] },
  '丁梦军': { color: '#E67E22', range: [323, 622] },
  '贺文择': { color: '#3498DB', range: [323, 622] },
  '蔡杰超': { color: '#E74C3C', range: [323, 622] }
};

// 可分配任务的用户列表（仅这3个用户）
const ASSIGNABLE_USERS = ['左宇翔', '彭逸', '黑典'];

// 初始化数据
function initData() {
  const data = {};
  for (let i = 323; i <= 622; i++) {
    data[i] = { 
      completed: false, 
      completedBy: null,
      assignedTo: null,  // 新增：分配给哪个用户（仅标识作用）
      marked: false,  // 新增：是否被标记为可领取
      status: 'not_started',
      inProgressBy: null,
      qualityFlags: {
        suspicious: false,
        highDuplicate: false,
        fake: false
      },
      teacherStatus: 'not_modified',
      notes: ''
    };
  }
  return data;
}

// 读取数据
function loadData() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const fileData = fs.readFileSync(DATA_FILE, 'utf8');
      return JSON.parse(fileData);
    }
  } catch (error) {
    console.error('读取数据文件出错:', error);
  }
  return initData();
}

// 保存数据
function saveData(data) {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
  } catch (error) {
    console.error('保存数据文件出错:', error);
  }
}

let taskData = loadData();

// 静态文件服务
app.use(express.static('public'));

// Socket.io 连接处理
io.on('connection', (socket) => {
  console.log('新用户连接:', socket.id);

  // 发送当前数据给新连接的客户端
  console.log('发送用户列表:', Object.keys(USERS));
  socket.emit('init', { taskData, users: USERS, assignableUsers: ASSIGNABLE_USERS });

  // 处理任务点击
  socket.on('toggleTask', ({ taskId, userName }) => {
    const task = taskData[taskId];
    
    if (!task) return;

    // 检查权限
    const canToggle = canUserToggleTask(taskId, userName);
    
    if (!canToggle) {
      socket.emit('error', { message: '你没有权限操作这个格子' });
      return;
    }

    // 切换状态
    if (task.completed && task.completedBy === userName) {
      // 如果是自己完成的，可以取消
      task.completed = false;
      task.completedBy = null;
    } else if (!task.completed) {
      // 如果未完成，标记为完成
      task.completed = true;
      task.completedBy = userName;
    } else {
      // 如果是别人完成的，不能修改
      socket.emit('error', { message: '这个格子已被其他人完成' });
      return;
    }

    saveData(taskData);
    
    // 广播更新给所有客户端
    io.emit('taskUpdate', { taskId, task: taskData[taskId] });
  });

  // 重置所有数据
  socket.on('resetAll', () => {
    taskData = initData();
    saveData(taskData);
    io.emit('reset', taskData);
  });

  // 处理标记任务（新增）
  socket.on('markTask', ({ taskId, userName }) => {
    const task = taskData[taskId];
    
    if (!task) return;

    // 检查权限：只有管理员可以标记
    const user = USERS[userName];
    if (!user || !user.isAdmin) {
      socket.emit('error', { message: '只有管理员可以标记任务' });
      return;
    }

    // 切换标记状态
    task.marked = !task.marked;

    saveData(taskData);
    
    // 广播更新给所有客户端
    io.emit('taskUpdate', { taskId, task: taskData[taskId] });
  });

  // 处理质量标记更新
  socket.on('updateQualityFlag', ({ taskId, userName, flag, value }) => {
    const task = taskData[taskId];
    
    if (!task) return;

    // 检查权限：只有管理员可以标记
    const user = USERS[userName];
    if (!user || !user.isAdmin) {
      socket.emit('error', { message: '只有管理员可以标记任务' });
      return;
    }

    // 更新质量标记
    if (!task.qualityFlags) {
      task.qualityFlags = {
        suspicious: false,
        highDuplicate: false,
        fake: false
      };
    }
    task.qualityFlags[flag] = value;

    saveData(taskData);
    
    // 广播更新给所有客户端
    io.emit('taskUpdate', { taskId, task: taskData[taskId] });
  });

  // 处理老师状态更新
  socket.on('updateTeacherStatus', ({ taskId, userName, status }) => {
    const task = taskData[taskId];
    
    if (!task) return;

    // 检查权限：只有管理员可以标记
    const user = USERS[userName];
    if (!user || !user.isAdmin) {
      socket.emit('error', { message: '只有管理员可以标记任务' });
      return;
    }

    // 更新老师状态
    task.teacherStatus = status;

    saveData(taskData);
    
    // 广播更新给所有客户端
    io.emit('taskUpdate', { taskId, task: taskData[taskId] });
  });

  // 处理任务分配（仅陈锦熠可用）
  socket.on('assignTask', ({ taskId, userName, assignTo }) => {
    const task = taskData[taskId];
    
    if (!task) return;

    // 检查权限：只有陈锦熠可以分配任务
    const user = USERS[userName];
    if (!user || !user.canAssign) {
      socket.emit('error', { message: '只有陈锦熠可以分配任务' });
      return;
    }

    // 检查分配的用户是否在允许列表中
    if (assignTo && !ASSIGNABLE_USERS.includes(assignTo)) {
      socket.emit('error', { message: '只能分配给左宇翔、彭逸或黑典' });
      return;
    }

    // 更新分配状态（如果assignTo为null，则取消分配）
    task.assignedTo = assignTo;

    saveData(taskData);
    
    // 广播更新给所有客户端
    io.emit('taskUpdate', { taskId, task: taskData[taskId] });
  });

  socket.on('disconnect', () => {
    console.log('用户断开连接:', socket.id);
  });
});

// 检查用户是否可以操作某个任务
function canUserToggleTask(taskId, userName) {
  const user = USERS[userName];
  if (!user) return false;

  const id = parseInt(taskId);
  const task = taskData[id];
  
  // 如果格子未被占用，任何人都可以点击
  if (!task.completed) {
    return true;
  }
  
  // 如果格子已被占用，只有完成者本人可以点击（用于取消）
  if (task.completed && task.completedBy === userName) {
    return true;
  }
  
  // 其他情况不允许点击
  return false;
}

// 获取本机局域网IP地址
function getLocalIP() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      // 跳过内部（即127.0.0.1）和非IPv4地址
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return 'localhost';
}

const LOCAL_IP = getLocalIP();

server.listen(PORT, '0.0.0.0', () => {
  console.log(`服务器运行在 http://localhost:${PORT}`);
  console.log(`局域网访问地址: http://${LOCAL_IP}:${PORT}`);
});

