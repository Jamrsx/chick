import { useCallback, useEffect, useState } from "react";
import { Tag, Modal, message, Avatar } from "antd";
import { 
  UserOutlined,
  PlusOutlined,
  DeleteOutlined,
  EditOutlined,
  BankOutlined,
  TeamOutlined,
  EnvironmentOutlined,
  KeyOutlined
} from "@ant-design/icons";
import { api } from "../config/api";

function Staff() {
  const [staff, setStaff] = useState([]);
  const [branches, setBranches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [selectedStaff, setSelectedStaff] = useState(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingStaff, setEditingStaff] = useState(null);

  const [form, setForm] = useState({
    username: '',
    password: '',
    firstname: '',
    lastname: '',
    middlename: '',
    address: '',
    branch_id: ''
  });

  const [editForm, setEditForm] = useState({
    username: '',
    password: '',
    firstname: '',
    lastname: '',
    middlename: '',
    address: '',
    branch_id: ''
  });

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [staffRes, branchesRes] = await Promise.all([
        api.get("/staff"),
        api.get("/branches"),
      ]);
      const branchRows = branchesRes.data || [];
      setBranches(branchRows);

      // Map staff with branch details (prefer branchAssignments)
      const mappedStaff = (staffRes.data || []).map((s) => {
        const assignments = Array.isArray(s.branchAssignments)
          ? s.branchAssignments
          : Array.isArray(s.branch_assignments)
            ? s.branch_assignments
            : [];
        const assignment = assignments[0] || null;
        const branchId = assignment?.branch_id ?? s.branch_id ?? "";
        const branch =
          branchId !== "" && branchId != null
            ? branchRows.find((b) => String(b.id) === String(branchId))
            : null;

        return {
          ...s,
          branch_id: branchId,
          branch: branch || assignment?.branch || null,
        };
      });

      setStaff(mappedStaff);
    } catch (error) {
      message.error("Failed to load staff data.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const addStaff = async () => {
    if (!form.username || !form.firstname || !form.lastname) {
      message.error("Please fill required fields (Username, First Name, Last Name)");
      return;
    }

    try {
      const payload = {
        username: form.username,
        password: form.password || undefined,
        firstname: form.firstname,
        lastname: form.lastname,
        middlename: form.middlename || undefined,
        address: form.address || undefined,
        branch_id: form.branch_id ? Number(form.branch_id) : null,
      };

      await api.post("/staff", payload);

      // Reset form
      setForm({
        username: '',
        password: '',
        firstname: '',
        lastname: '',
        middlename: '',
        address: '',
        branch_id: ''
      });
      setShowAddModal(false);

      // Re-fetch so branchAssignments (saved in DB) shows immediately
      await loadData();
      message.success("Staff member added successfully");
      if (!form.password || String(form.password).trim() === "") {
        message.info("Default staff password is: default123");
      }
    } catch (error) {
      console.error("Add staff error:", error);
      const validationErrors = error?.response?.data?.errors;
      if (validationErrors) {
        const firstField = Object.keys(validationErrors)[0];
        const firstMessage = validationErrors[firstField]?.[0];
        message.error(firstMessage || "Failed to add staff member");
      } else {
        message.error(error?.response?.data?.message || "Failed to add staff member");
      }
    }
  };

  const updateStaff = async () => {
    if (!editForm.username || !editForm.firstname || !editForm.lastname) {
      message.error("Please fill required fields (Username, First Name, Last Name)");
      return;
    }

    try {
      const payload = {
        username: editForm.username,
        firstname: editForm.firstname,
        lastname: editForm.lastname,
        middlename: editForm.middlename || undefined,
        address: editForm.address || undefined,
        branch_id: editForm.branch_id ? Number(editForm.branch_id) : null,
      };

      // Only include password if it's provided (not empty)
      if (editForm.password && editForm.password.trim() !== '') {
        payload.password = editForm.password;
      }

      await api.put(`/staff/${editingStaff.id}`, payload);

      setShowEditModal(false);
      setEditingStaff(null);
      setEditForm({
        username: '',
        password: '',
        firstname: '',
        lastname: '',
        middlename: '',
        address: '',
        branch_id: ''
      });

      // Re-fetch so branch assignment reflects what backend saved
      await loadData();
      message.success("Staff member updated successfully");
    } catch (error) {
      console.error("Update staff error:", error);
      const validationErrors = error?.response?.data?.errors;
      if (validationErrors) {
        const firstField = Object.keys(validationErrors)[0];
        const firstMessage = validationErrors[firstField]?.[0];
        message.error(firstMessage || "Failed to update staff member");
      } else {
        message.error(error?.response?.data?.message || "Failed to update staff member");
      }
    }
  };

  const deleteStaff = async () => {
    if (!selectedStaff) return;
    
    try {
      await api.delete(`/staff/${selectedStaff}`);
      setShowDeleteModal(false);
      setSelectedStaff(null);
      await loadData();
      message.success("Staff member deleted successfully");
    } catch (error) {
      message.error("Failed to delete staff member");
    }
  };

  const openDeleteModal = (id) => {
    setSelectedStaff(id);
    setShowDeleteModal(true);
  };

  const openEditModal = (staffMember) => {
    setEditingStaff(staffMember);
    setEditForm({
      username: staffMember.username || '',
      password: '', // Don't populate password for security
      firstname: staffMember.firstname || '',
      lastname: staffMember.lastname || '',
      middlename: staffMember.middlename || '',
      address: staffMember.address || '',
      branch_id: staffMember.branch_id || ''
    });
    setShowEditModal(true);
  };

  // Calculate statistics
  const totalStaff = staff.length;
  const staffWithBranches = staff.filter(s => s.branch_id && s.branch_id !== null && s.branch_id !== '').length;

  return (
    <div className="h-screen flex flex-col bg-gray-50 overflow-hidden">
      {/* Header - Sticky at top */}
      <div className="bg-white border-b border-gray-200 px-6 py-4 shadow-sm flex-shrink-0">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-800">Staff Management</h1>
              <p className="text-gray-500 mt-1">Manage your staff members and their branch assignments</p>
            </div>
            <button
              onClick={() => setShowAddModal(true)}
              className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 transition-colors"
            >
              <PlusOutlined />
              Add Staff
            </button>
          </div>
        </div>
      </div>

      {/* Scrollable Content Area */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-7xl mx-auto px-6 py-6">
          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-gray-500 uppercase tracking-wide">Total Staff</p>
                  <p className="text-2xl font-bold text-gray-800">{totalStaff}</p>
                </div>
                <div className="bg-blue-100 rounded-full p-3">
                  <TeamOutlined className="text-xl text-blue-600" />
                </div>
              </div>
            </div>
            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-gray-500 uppercase tracking-wide">With Branch Assignment</p>
                  <p className="text-2xl font-bold text-green-600">{staffWithBranches}</p>
                </div>
                <div className="bg-green-100 rounded-full p-3">
                  <BankOutlined className="text-xl text-green-600" />
                </div>
              </div>
            </div>
            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-gray-500 uppercase tracking-wide">Unassigned Staff</p>
                  <p className="text-2xl font-bold text-orange-600">{totalStaff - staffWithBranches}</p>
                </div>
                <div className="bg-orange-100 rounded-full p-3">
                  <UserOutlined className="text-xl text-orange-600" />
                </div>
              </div>
            </div>
            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-gray-500 uppercase tracking-wide">Total Branches</p>
                  <p className="text-2xl font-bold text-purple-600">{branches.length}</p>
                </div>
                <div className="bg-purple-100 rounded-full p-3">
                  <BankOutlined className="text-xl text-purple-600" />
                </div>
              </div>
            </div>
          </div>

          {/* Staff List Section */}
          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            <div className="bg-gray-50 border-b border-gray-200 px-6 py-3">
              <div className="flex items-center gap-2">
                <TeamOutlined className="text-blue-600" />
                <span className="font-semibold text-gray-700">Staff Directory</span>
                <Tag color="blue" className="ml-2">
                  {totalStaff} {totalStaff === 1 ? 'Member' : 'Members'}
                </Tag>
              </div>
            </div>
            
            {loading ? (
              <div className="flex justify-center py-20">
                <div className="relative">
                  <div className="animate-spin rounded-full h-16 w-16 border-t-4 border-b-4 border-blue-500"></div>
                </div>
              </div>
            ) : staff.length === 0 ? (
              <div className="p-12 text-center">
                <UserOutlined className="text-6xl text-gray-300 mb-4" />
                <p className="text-gray-500 text-lg mb-2">No staff members found</p>
                <p className="text-gray-400">Click "Add Staff" to add your first staff member</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-200">
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">NO.</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">STAFF</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">USERNAME</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">BRANCH</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">ADDRESS</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">ACTION</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {staff.map((s, idx) => (
                      <tr key={s.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-3 text-gray-500">{idx + 1}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <Avatar 
                              icon={<UserOutlined />} 
                              className="bg-blue-500"
                              size="default"
                            />
                            <div>
                              <div className="font-medium text-gray-800">
                                {s.firstname} {s.lastname}
                              </div>
                              {s.middlename && (
                                <div className="text-xs text-gray-400">{s.middlename}</div>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <KeyOutlined className="text-gray-400 text-xs" />
                            <span className="font-mono text-sm">{s.username}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          {s.branch?.name ? (
                            <Tag color="green">{s.branch.name}</Tag>
                          ) : s.branch_id ? (
                            <Tag color="orange">Loading...</Tag>
                          ) : (
                            <Tag color="default">Not Assigned</Tag>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {s.address ? (
                            <div className="flex items-center gap-2">
                              <EnvironmentOutlined className="text-gray-400 text-xs" />
                              <span className="text-gray-600 text-sm">{s.address}</span>
                            </div>
                          ) : (
                            <span className="text-gray-400 text-sm">-</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => openEditModal(s)}
                              className="text-blue-500 hover:text-blue-700 transition-colors"
                              title="Edit Staff"
                            >
                              <EditOutlined />
                            </button>
                            <button
                              onClick={() => openDeleteModal(s.id)}
                              className="text-red-500 hover:text-red-700 transition-colors"
                              title="Delete Staff"
                            >
                              <DeleteOutlined />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="mt-6 text-center text-xs text-gray-400 border-t border-gray-200 pt-4">
            <p>Staff Directory | New Moon Lechon Manok and Liempo</p>
          </div>
        </div>
      </div>

      {/* Add Staff Modal */}
      <Modal
        title={
          <div className="flex items-center gap-2">
            <PlusOutlined className="text-blue-600" />
            <span>Add New Staff Member</span>
          </div>
        }
        open={showAddModal}
        onCancel={() => {
          setShowAddModal(false);
          setForm({
            username: '',
            password: '',
            firstname: '',
            lastname: '',
            middlename: '',
            address: '',
            branch_id: ''
          });
        }}
        footer={[
          <button
            key="cancel"
            onClick={() => {
              setShowAddModal(false);
              setForm({
                username: '',
                password: '',
                firstname: '',
                lastname: '',
                middlename: '',
                address: '',
                branch_id: ''
              });
            }}
            className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>,
          <button
            key="submit"
            onClick={addStaff}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors ml-2"
          >
            Add Staff
          </button>,
        ]}
        width={600}
      >
        <div className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Username <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                placeholder="Enter username"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                value={form.username}
                onChange={e => setForm({ ...form, username: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Password</label>
              <input
                type="password"
                placeholder="Enter password"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                value={form.password}
                onChange={e => setForm({ ...form, password: e.target.value })}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                First Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                placeholder="Enter first name"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                value={form.firstname}
                onChange={e => setForm({ ...form, firstname: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Last Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                placeholder="Enter last name"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                value={form.lastname}
                onChange={e => setForm({ ...form, lastname: e.target.value })}
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Middle Name</label>
            <input
              type="text"
              placeholder="Enter middle name"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
              value={form.middlename}
              onChange={e => setForm({ ...form, middlename: e.target.value })}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Address</label>
            <textarea
              placeholder="Enter address"
              rows="2"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all resize-none"
              value={form.address}
              onChange={e => setForm({ ...form, address: e.target.value })}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Branch Assignment</label>
            <select
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
              value={form.branch_id}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, branch_id: e.target.value }))
              }
            >
              <option value="">Select Branch (Optional)</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </Modal>

      {/* Edit Staff Modal */}
      <Modal
        title={
          <div className="flex items-center gap-2">
            <EditOutlined className="text-blue-600" />
            <span>Edit Staff Member</span>
          </div>
        }
        open={showEditModal}
        onCancel={() => {
          setShowEditModal(false);
          setEditingStaff(null);
          setEditForm({
            username: '',
            password: '',
            firstname: '',
            lastname: '',
            middlename: '',
            address: '',
            branch_id: ''
          });
        }}
        footer={[
          <button
            key="cancel"
            onClick={() => {
              setShowEditModal(false);
              setEditingStaff(null);
              setEditForm({
                username: '',
                password: '',
                firstname: '',
                lastname: '',
                middlename: '',
                address: '',
                branch_id: ''
              });
            }}
            className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>,
          <button
            key="submit"
            onClick={updateStaff}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors ml-2"
          >
            Update Staff
          </button>,
        ]}
        width={600}
      >
        <div className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Username <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                placeholder="Enter username"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                value={editForm.username}
                onChange={e => setEditForm({ ...editForm, username: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Password</label>
              <input
                type="password"
                placeholder="Leave blank to keep current password"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                value={editForm.password}
                onChange={e => setEditForm({ ...editForm, password: e.target.value })}
              />
              <p className="text-xs text-gray-500 mt-1">Leave empty to keep current password</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                First Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                placeholder="Enter first name"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                value={editForm.firstname}
                onChange={e => setEditForm({ ...editForm, firstname: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Last Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                placeholder="Enter last name"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                value={editForm.lastname}
                onChange={e => setEditForm({ ...editForm, lastname: e.target.value })}
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Middle Name</label>
            <input
              type="text"
              placeholder="Enter middle name"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
              value={editForm.middlename}
              onChange={e => setEditForm({ ...editForm, middlename: e.target.value })}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Address</label>
            <textarea
              placeholder="Enter address"
              rows="2"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all resize-none"
              value={editForm.address}
              onChange={e => setEditForm({ ...editForm, address: e.target.value })}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Branch Assignment</label>
            <select
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
              value={editForm.branch_id}
              onChange={(e) =>
                setEditForm((prev) => ({ ...prev, branch_id: e.target.value }))
              }
            >
              <option value="">Select Branch (Optional)</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        title={
          <div className="flex items-center gap-2">
            <DeleteOutlined className="text-red-600" />
            <span>Delete Staff Member</span>
          </div>
        }
        open={showDeleteModal}
        onCancel={() => {
          setShowDeleteModal(false);
          setSelectedStaff(null);
        }}
        footer={[
          <button
            key="cancel"
            onClick={() => {
              setShowDeleteModal(false);
              setSelectedStaff(null);
            }}
            className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>,
          <button
            key="delete"
            onClick={deleteStaff}
            className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors ml-2"
          >
            Delete
          </button>,
        ]}
        width={400}
      >
        <div className="py-4">
          <p className="text-gray-700 mb-2">Are you sure you want to delete this staff member?</p>
          <p className="text-sm text-gray-500">This action cannot be undone.</p>
        </div>
      </Modal>
    </div>
  );
}

export default Staff;