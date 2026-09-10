const asyncHandler = require('../utils/asyncHandler');
const adminService = require('../services/admin.service');

const getPendingInstructors = asyncHandler(async (req, res) => {
  const instructors = await adminService.getPendingInstructors();

  res.json({
    success: true,
    data: { instructors }
  });
});

const approveInstructor = asyncHandler(async (req, res) => {
  const user = await adminService.approveInstructor(req.params.id);

  res.json({
    success: true,
    data: { user }
  });
});

const rejectInstructor = asyncHandler(async (req, res) => {
  const user = await adminService.rejectInstructor(req.params.id);

  res.json({
    success: true,
    data: { user }
  });
});

const getAllUsers = asyncHandler(async (req, res) => {
  const { role, status, page, limit } = req.query;

  const result = await adminService.getAllUsers({
    role: role || null,
    status: status || null,
    page: parseInt(page || '1', 10),
    limit: parseInt(limit || '50', 10),
  });

  res.json({
    success: true,
    data: result
  });
});

// PATCH /api/admin/users/:id/status
// Body: { status: "SUSPENDED" | "ACTIVE" }
const setUserStatus = asyncHandler(async (req, res) => {
  const { status } = req.body;

  const user = await adminService.setUserStatus(
    req.params.id,
    status,
    req.user.id
  );

  res.json({
    success: true,
    data: { user }
  });
});

const deleteUser = asyncHandler(async (req, res) => {
  const result = await adminService.deleteUser(
    req.params.id,
    req.user.id
  );

  res.json({
    success: true,
    data: result
  });
});

const forceDeleteInstructor = asyncHandler(async (req, res) => {
  const result = await adminService.forceDeleteInstructor(
    req.params.id,
    req.user.id
  );

  res.json({
    success: true,
    data: result
  });
});

module.exports = {
  getPendingInstructors,
  approveInstructor,
  rejectInstructor,
  getAllUsers,
  setUserStatus,
  deleteUser,
  forceDeleteInstructor,
};